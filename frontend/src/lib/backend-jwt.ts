import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.INTERNAL_JWT_SECRET);

export async function createBackendToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(secret);
}
