import { NextResponse } from "next/server";

// Optimistic check only (cookie presence). Real authorization happens in the DAL on the server.
const PUBLIC = ["/login", "/signup"];

export function proxy(request) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("qa_session");
  if (!hasSession && !PUBLIC.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
