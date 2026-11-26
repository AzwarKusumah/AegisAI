import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const apiUrl = process.env.AEGIS_API_URL;
  const adminToken = process.env.AEGIS_ADMIN_TOKEN;
  if (!apiUrl || !adminToken) return NextResponse.json({ error: "control_plane_not_configured" }, { status: 503 });

  let payload: { expires_in_hours?: number } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }
  const hours = Number(payload.expires_in_hours ?? 1);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
    return NextResponse.json({ error: "expires_in_hours_must_be_between_1_and_24" }, { status: 400 });
  }
  try {
    const response = await fetch(new URL("/api/v1/pairing-codes", apiUrl), {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_in_hours: hours }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "control_plane_unavailable" }, { status: 502 });
  }
}
