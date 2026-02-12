import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createBackendToken } from "@/lib/backend-jwt";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      return NextResponse.json(
        { error: "BACKEND_URL not configured" },
        { status: 500 },
      );
    }

    const backendToken = await createBackendToken(session.user.id);
    const { proxy } = await params;
    const path = proxy.join("/");
    const base = backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`;
    const url = new URL(path, base);
    url.search = req.nextUrl.search;

    const headers: HeadersInit = {
      Authorization: `Bearer ${backendToken}`,
    };

    // Only set Content-Type for requests with bodies
    if (req.method !== "GET" && req.method !== "DELETE") {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "DELETE" ? await req.text() : undefined,
      signal: AbortSignal.timeout(15000),
    });

    // Stream the response back
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return NextResponse.json(
      { error: "Proxy error", detail: String(err) },
      { status: 500 },
    );
  }
}

export {
  handler as GET,
  handler as POST,
  handler as PATCH,
  handler as PUT,
  handler as DELETE,
};
