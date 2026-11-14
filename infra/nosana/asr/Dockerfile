FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
# Fetch public model weights while building the image, never while handling farm data.
ARG WHISPER_MODEL=small
ENV HF_HUB_DISABLE_TELEMETRY=1
RUN python3 -c 'import os; from faster_whisper.utils import download_model; download_model(os.environ["WHISPER_MODEL"], output_dir="/opt/whisper")'
ENV WHISPER_MODEL=${WHISPER_MODEL} WHISPER_MODEL_PATH=/opt/whisper HF_HUB_OFFLINE=1
COPY server.py .
EXPOSE 8000
CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
