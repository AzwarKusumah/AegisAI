import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

async function forward(request: Request, context: { params: Promise<{ policyId: string }> }, method: "PUT" | "DELETE") {
  const apiUrl = process.env.AEGIS_API_URL;
  const adminToken = process.env.AEGIS_ADMIN_TOKEN;
  if (!apiUrl || !adminToken) return NextResponse.json({ error: "control_plane_not_configured" }, { status: 503 });
  const { policyId } = await context.params;
  try {
    const response = await fetch(new URL("/api/v1/policies/" + encodeURIComponent(policyId), apiUrl), {
      method,
      headers: { Authorization: "Bearer " + adminToken, ...(method === "PUT" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "PUT" ? { body: JSON.stringify(await request.json()) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (response.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "control_plane_unavailable" }, { status: 502 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ policyId: string }> }) {
  return forward(request, context, "PUT");
}
export async function DELETE(request: Request, context: { params: Promise<{ policyId: string }> }) {
  return forward(request, context, "DELETE");
}
