import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    backend_url_set: !!process.env.BACKEND_URL,
    backend_url_starts: process.env.BACKEND_URL?.slice(0, 30) ?? "NOT SET",
    internal_jwt_secret_set: !!process.env.INTERNAL_JWT_SECRET,
    nextauth_secret_set: !!process.env.NEXTAUTH_SECRET,
  });
}
