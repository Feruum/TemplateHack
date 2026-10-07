import type { NextRequest } from "next/server";

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8000";
const AGENT_API_KEY = process.env.AGENT_API_KEY || process.env.AGENT_AGENT_API_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authorization = request.headers.get("Authorization");
    const requestApiKey = request.headers.get("X-API-Key");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Thread-ID": request.headers.get("X-Thread-ID") || "",
      "X-User-ID": request.headers.get("X-User-ID") || "",
    };

    if (authorization) {
      headers.Authorization = authorization;
    }

    if (requestApiKey) {
      headers["X-API-Key"] = requestApiKey;
    } else if (!authorization && AGENT_API_KEY) {
      headers["X-API-Key"] = AGENT_API_KEY;
    }

    const agentResponse = await fetch(`${AGENT_SERVICE_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      return new Response(errorText, {
        status: agentResponse.status,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (!agentResponse.body) {
      return new Response("No response body from agent", { status: 502 });
    }

    return new Response(agentResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Agent proxy error:", error);
    return new Response(JSON.stringify({ error: "Failed to connect to agent service" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
