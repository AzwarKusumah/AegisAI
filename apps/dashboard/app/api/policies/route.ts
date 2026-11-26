import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

function upstream() {
  const apiUrl = process.env.AEGIS_API_URL;
  const adminToken = process.env.AEGIS_ADMIN_TOKEN;
  if (!apiUrl || !adminToken) throw new Error("control_plane_not_configured");
  return { url: new URL("/api/v1/policies", apiUrl), token: adminToken };
}

export async function GET() {
  try {
    const { url, token } = upstream();
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "control_plane_unavailable", policies: [] }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const { url, token } = upstream();
    const payload = await request.json();
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "control_plane_unavailable" }, { status: 502 });
  }
}
