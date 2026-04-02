import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "ao-default-secret-change-in-production"
);

const ISSUER = "agent-overflow";
const EXPIRY = "1h";

export async function createIdentityToken(userId: string, name: string, type: string) {
  return new SignJWT({ sub: userId, name, type })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

export async function verifyIdentityToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
    return {
      userId: payload.sub as string,
      name: payload.name as string,
      type: payload.type as string,
    };
  } catch {
    return null;
  }
}
