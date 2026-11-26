import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSessionToken } from "../../../../lib/session";

export const runtime = "nodejs";

function matches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isSameOrigin(request: Request, origin: string): boolean {
  try {
    const supplied = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const expectedProtocol = forwardedProto || requestUrl.protocol.replace(/:$/, "");
    return supplied.host.toLowerCase() === expectedHost.toLowerCase() &&
      supplied.protocol === expectedProtocol + ":";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !isSameOrigin(request, origin)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const username = process.env.AEGIS_DASHBOARD_USER ?? "";
  const password = process.env.AEGIS_DASHBOARD_PASSWORD ?? "";
  const adminToken = process.env.AEGIS_ADMIN_TOKEN ?? "";
  if (!username || !password || !adminToken) {
    return NextResponse.json({ error: "dashboard_auth_not_configured" }, { status: 503 });
  }
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof body.username !== "string" || typeof body.password !== "string" ||
      !matches(body.username, username) || !matches(body.password, password)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await createSessionToken(username);
  const response = NextResponse.json({ authenticated: true });
  const forwardedProto = request.headers.get("x-forwarded-proto");
  response.cookies.set("aegisai_session", token, {
    httpOnly: true,
    secure: forwardedProto === "https" || new URL(request.url).protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
