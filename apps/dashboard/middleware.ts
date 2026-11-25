import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const username = process.env.AEGIS_DASHBOARD_USER;
  const password = process.env.AEGIS_DASHBOARD_PASSWORD;

  if (!username || !password) {
    return new NextResponse("AegisAI dashboard authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const expected = "Basic " + btoa(username + ":" + password);
  const provided = request.headers.get("authorization") ?? "";

  if (provided !== expected) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="AegisAI Dashboard", charset="UTF-8"',
        "Cache-Control": "no-store"
      }
    });
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"]
};
