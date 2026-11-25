import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const apiUrl = process.env.AEGIS_API_URL;
  const adminToken = process.env.AEGIS_ADMIN_TOKEN;
  if (!apiUrl || !adminToken) {
    return NextResponse.json({ error: "Server-side AEGIS_API_URL and AEGIS_ADMIN_TOKEN are required", events: [] }, { status: 503 });
  }
  const incoming = new URL(request.url);
  const upstream = new URL("/api/v1/events", apiUrl);
  upstream.searchParams.set("q", incoming.searchParams.get("q") ?? "");
  upstream.searchParams.set("limit", incoming.searchParams.get("limit") ?? "100");
  try {
    const response = await fetch(upstream, {
      headers: { Authorization: "Bearer " + adminToken },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Control plane unavailable", events: [] }, { status: 502 });
  }
}
