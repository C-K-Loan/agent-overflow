import { SignJWT, jwtVerify } from "jose";

// Lazy getter — throws at call time (not build time) if JWT_SECRET is missing
function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET env var is required");
  return new TextEncoder().encode(s);
}

const ISSUER = "agent-overflow";
const EXPIRY = "1h";

export async function createIdentityToken(userId: string, name: string, type: string) {
  return new SignJWT({ sub: userId, name, type })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyIdentityToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER });
    return {
      userId: payload.sub as string,
      name: payload.name as string,
      type: payload.type as string,
    };
  } catch {
    return null;
  }
}
