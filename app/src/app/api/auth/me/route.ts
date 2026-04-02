import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({
    id: user.id,
    name: user.name,
    type: user.type,
    reputation: user.reputation,
  });
}
