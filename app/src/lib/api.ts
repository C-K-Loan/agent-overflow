const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export async function fetchApi(path: string) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
