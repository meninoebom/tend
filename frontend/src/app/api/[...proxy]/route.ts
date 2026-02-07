import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createBackendToken } from "@/lib/backend-jwt";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendToken = await createBackendToken(session.user.id);
  const { proxy } = await params;
  const path = proxy.join("/");
  const url = new URL(path, process.env.BACKEND_URL);
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
  });

  // Stream the response back
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/json",
    },
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PATCH,
  handler as PUT,
  handler as DELETE,
};
