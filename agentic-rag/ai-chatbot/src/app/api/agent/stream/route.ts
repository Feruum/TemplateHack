import { NextRequest } from "next/server";

const AGENT_URL = process.env.AGENT_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const threadId = request.headers.get("X-Thread-ID") || "";
  const userId = request.headers.get("X-User-ID") || "";

  const response = await fetch(`${AGENT_URL}/agent/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(threadId && { "X-Thread-ID": threadId }),
      ...(userId && { "X-User-ID": userId }),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: `Agent error: ${response.status}` }),
      {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
