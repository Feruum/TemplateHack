import type { NextRequest } from "next/server";

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8000";
const AGENT_API_KEY = process.env.AGENT_API_KEY || process.env.AGENT_AGENT_API_KEY || "";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("Authorization");
    const requestApiKey = request.headers.get("X-API-Key");

    const headers: Record<string, string> = {};

    if (authorization) {
      headers.Authorization = authorization;
    }

    if (requestApiKey) {
      headers["X-API-Key"] = requestApiKey;
    } else if (!authorization && AGENT_API_KEY) {
      headers["X-API-Key"] = AGENT_API_KEY;
    }

    const agentResponse = await fetch(`${AGENT_SERVICE_URL}/api/v1/storage/stats`, {
      method: "GET",
      headers,
    });

    if (!agentResponse.body) {
      return new Response("No response body from agent", { status: 502 });
    }

    return new Response(agentResponse.body, {
      status: agentResponse.status,
      headers: {
        "Content-Type": agentResponse.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Agent storage proxy error:", error);
    return new Response(JSON.stringify({ error: "Failed to connect to agent service" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
