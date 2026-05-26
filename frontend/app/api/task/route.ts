import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = req.headers.get("x-anthropic-key") || "";

  const backendRes = await fetch(`${BACKEND_URL}/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Anthropic-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!backendRes.ok) {
    const error = await backendRes.json().catch(() => ({ detail: "Backend error" }));
    return new Response(JSON.stringify(error), {
      status: backendRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(backendRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
