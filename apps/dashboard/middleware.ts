import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "./lib/session";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/auth/login" || path === "/api/auth/logout") {
    return NextResponse.next();
  }

  if (!process.env.AEGIS_DASHBOARD_USER || !process.env.AEGIS_DASHBOARD_PASSWORD || !process.env.AEGIS_ADMIN_TOKEN) {
    return new NextResponse("AegisAI dashboard authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const token = request.cookies.get("aegisai_session")?.value;
  if (!(await verifySessionToken(token))) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"]
};
