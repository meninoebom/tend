import { NextRequest, NextResponse } from "next/server";

/**
 * Unauthenticated proxy for password reset endpoints.
 * These cannot go through the main [...proxy] route because it requires a session.
 * Forwards POST requests to the backend's /users/forgot-password or /users/reset-password.
 */
export async function POST(req: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "Internal server error" }, { status: 502 });
  }

  try {
    const body = await req.json();
    const action = body._action as string;
    delete body._action;

    let endpoint: string;
    if (action === "forgot") {
      endpoint = "/users/forgot-password";
    } else if (action === "reset") {
      endpoint = "/users/reset-password";
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const base = backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`;
    const res = await fetch(new URL(endpoint.slice(1), base).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Password reset proxy error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 502 });
  }
}
