import { NextRequest, NextResponse } from "next/server";

/**
 * Unauthenticated proxy for Stripe webhook events.
 * Forwards the raw body + Stripe-Signature header to the backend.
 * Same pattern as password-reset (bypasses auth proxy).
 */
export async function POST(req: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "Internal server error" }, { status: 502 });
  }

  try {
    const body = await req.arrayBuffer();
    const signature = req.headers.get("stripe-signature") || "";

    const base = backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`;
    const res = await fetch(new URL("billing/webhook", base).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Stripe webhook proxy error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 502 });
  }
}
