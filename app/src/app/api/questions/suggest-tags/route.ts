import { suggestTags } from "@/lib/autotag";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title") || "";
  const body = request.nextUrl.searchParams.get("body") || "";

  if (!title && !body) return Response.json([]);

  const tags = await suggestTags(title, body);
  return Response.json(tags);
}
