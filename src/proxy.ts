import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";

const PUBLIC_PATHS = ["/login", "/setup"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!req.auth && !isPublic) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (req.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets and the auth API itself; guard everything else,
  // including other API routes (server actions are POSTs to pages, which
  // this matcher still covers).
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
