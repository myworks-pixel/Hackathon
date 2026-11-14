import { NextResponse } from "next/server";
import { readState, requestWorkspace, withWorkspace } from "@/lib/farm/store";
import { availableStock } from "@/lib/farm/domain";
import { providerStatus } from "@/lib/farm/providers";
import { dispatch } from "@/lib/farm/actions";
import { checkOrigin, fail } from "@/lib/farm/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return withWorkspace(requestWorkspace(request), () => {
      const s = readState();
      return NextResponse.json(
        {
          state: {
            ...s,
            requests: undefined,
            attachments: s.attachments.map(({ id, name, mime, size }) => ({
              id,
              name,
              mime,
              size,
            })),
            jobs: s.jobs
              .slice(-30)
              .map(({ input, ...job }) => ({ ...job, hasInput: !!input })),
          },
          availableKg: availableStock(s),
          providers: providerStatus(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const requestId = request.headers.get("idempotency-key");
    if (!requestId || requestId.length > 100)
      throw new Error("缺少请求标识，请重试。");
    const body = await request.text();
    if (body.length > 50000) throw new Error("输入内容过长。");
    const execution = request.headers.get("x-farm-execution") || "live";
    if (execution !== "live" && execution !== "offline")
      throw new Error("执行模式无效。");
    return NextResponse.json(
      withWorkspace(requestWorkspace(request), () =>
        dispatch(
          JSON.parse(body),
          requestId,
          request.headers.get("x-app-locale") === "en" ? "en" : "ja",
          execution,
        ),
      ),
    );
  } catch (error) {
    return fail(error);
  }
}
