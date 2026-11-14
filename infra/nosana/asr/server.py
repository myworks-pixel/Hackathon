"""OpenAI-compatible ASR endpoint for a Nosana GPU deployment, not a control-plane API."""
import asyncio
import hmac
import os
import tempfile
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form
# Inference runs entirely on Nosana; missing weights must not trigger hub requests.
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
from faster_whisper import WhisperModel

token = os.environ.get('INFERENCE_API_KEY', '')
model_name = os.environ.get('WHISPER_MODEL', 'small')
model_path = os.environ.get('WHISPER_MODEL_PATH', '/opt/whisper')
gate = asyncio.Semaphore(1)

@asynccontextmanager
async def lifespan(app):
    if not token:
        raise RuntimeError('INFERENCE_API_KEY is required')
    if not all((Path(model_path) / filename).is_file() for filename in ('model.bin', 'config.json', 'tokenizer.json')):
        raise RuntimeError('Build the ASR image with complete local model weights before deploying.')
    app.state.model = await asyncio.to_thread(WhisperModel, model_path, device='cuda', compute_type='float16', local_files_only=True)
    yield

app = FastAPI(lifespan=lifespan)

@app.get('/health')
async def health():
    return {'ready': hasattr(app.state, 'model')}

@app.post('/v1/audio/transcriptions')
async def transcribe(file: UploadFile = File(...), model: str = Form(...), authorization: str = Header(default='')):
    if not hmac.compare_digest(authorization, 'Bearer ' + token):
        raise HTTPException(status_code=401, detail='Unauthorized')
    if model != model_name:
        raise HTTPException(status_code=400, detail='Unknown model')
    data = await file.read(12 * 1024 * 1024 + 1)
    if not data or len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail='File exceeds limit')
    async with gate:
        with tempfile.NamedTemporaryFile(suffix='.audio') as tmp:
            tmp.write(data)
            tmp.flush()
            def run():
                segments, _ = app.state.model.transcribe(tmp.name, vad_filter=True)
                return ''.join(segment.text for segment in segments)
            text = await asyncio.to_thread(run)
    return {'text': text}
