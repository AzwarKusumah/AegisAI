import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await context.params;
  const apiUrl = process.env.AEGIS_API_URL;
  const adminToken = process.env.AEGIS_ADMIN_TOKEN;
  if (!apiUrl || !adminToken) return NextResponse.json({ error: "control_plane_not_configured" }, { status: 503 });
  try {
    const response = await fetch(new URL("/api/v1/devices/" + encodeURIComponent(deviceId), apiUrl), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + adminToken },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (response.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ error: "device_revocation_failed" }, { status: response.status });
  } catch {
    return NextResponse.json({ error: "control_plane_unavailable" }, { status: 502 });
  }
}
