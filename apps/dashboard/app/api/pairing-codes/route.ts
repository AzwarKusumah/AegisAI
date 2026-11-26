import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST() {
  const apiUrl = process.env.AEGIS_API_URL;
  const adminToken = process.env.AEGIS_ADMIN_TOKEN;
  if (!apiUrl || !adminToken) return NextResponse.json({ error: "control_plane_not_configured" }, { status: 503 });
  try {
    const response = await fetch(new URL("/api/v1/pairing-codes", apiUrl), {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "control_plane_unavailable" }, { status: 502 });
  }
}
