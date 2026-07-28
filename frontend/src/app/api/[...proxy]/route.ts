import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createBackendToken } from "@/lib/backend-jwt";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  try {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      return NextResponse.json(
        { error: "BACKEND_URL not configured" },
        { status: 500 },
      );
    }

    // Two ways in. A browser session gets a freshly minted 60s proxy JWT. An
    // external client (the tend CLI, Plot, an agent) presents a personal access
    // token, which we forward verbatim for the backend to validate against its
    // token hashes. The backend has no public domain, so this proxy is the only
    // door — without the PAT branch, tokens would be unreachable in production.
    //
    // ONLY the tend_pat_ prefix is passed through. Any other Authorization value
    // is ignored and replaced by a JWT we mint ourselves, so a caller can never
    // smuggle in a self-supplied proxy token. Which endpoints a PAT may actually
    // reach is decided by the backend (get_user_id_allow_pat), not here.
    const incomingAuth = req.headers.get("authorization") ?? "";
    const isPat = incomingAuth.startsWith("Bearer tend_pat_");

    let backendToken: string;
    if (isPat) {
      backendToken = incomingAuth.slice("Bearer ".length);
    } else {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      backendToken = await createBackendToken(session.user.id);
    }

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
      { error: "Internal server error" },
      { status: 502 },
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
