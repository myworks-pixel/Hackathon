import { NextResponse } from "next/server";
import { ZodError } from "zod";
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new Error("不接受跨站请求。");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("不接受跨站请求。");
}
export function fail(error: unknown) {
  const text =
    error instanceof ZodError
      ? "输入格式不正确，请检查必填项、数量和日期。"
      : error instanceof Error
        ? error.message
        : "请求处理失败。";
  return NextResponse.json({ error: text }, { status: 400 });
}
