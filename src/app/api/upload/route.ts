import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
  workspaceDataDir,
  updateState,
  requestWorkspace,
  withWorkspace,
} from "@/lib/farm/store";
import { id } from "@/lib/farm/domain";
import { checkOrigin, fail } from "@/lib/farm/http";
export const runtime = "nodejs";
const allowed = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
]);
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return await withWorkspace(requestWorkspace(request), async () => {
      if (Number(request.headers.get("content-length")) > 13 * 1024 * 1024)
        throw new Error("附件不能超过 12 MB。");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 12 * 1024 * 1024)
        throw new Error("请选择 12 MB 以内的图片或音频。");
      const mime = file.type.split(";")[0];
      if (!allowed.has(mime))
        throw new Error("支持 JPG、PNG、WebP 图片及常用录音格式。");
      const fileId = id();
      await mkdir(join(workspaceDataDir(), "uploads"), { recursive: true });
      const path = join(workspaceDataDir(), "uploads", fileId);
      await writeFile(path, Buffer.from(await file.arrayBuffer()), {
        mode: 0o600,
      });
      const attachment = {
        id: fileId,
        name: file.name.slice(0, 120),
        mime,
        size: file.size,
        path,
      };
      updateState((s) => s.attachments.push(attachment));
      return NextResponse.json({ id: fileId, name: attachment.name });
    });
  } catch (error) {
    return fail(error);
  }
}
