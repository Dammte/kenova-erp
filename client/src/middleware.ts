import { NextResponse, type NextRequest } from "next/server";

/**
 * First line of protection for pages: without a session cookie the user is sent
 * to /login before any page code or data loads. The API still checks the session
 * on every request; this only avoids rendering the app shell to anonymous users.
 */
const SESSION_COOKIES = ["__Host-sid", "sid"];
const PUBLIC_PAGES = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PAGES.includes(pathname)) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => req.cookies.get(name)?.value);
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the API proxy, Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
