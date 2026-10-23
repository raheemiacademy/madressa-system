import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = /^\/(admin|teacher|parent|student)\/login\/?$/;

// Cheap gate only: no cookie → login page. Every page and action still validates the session itself.
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const portal = pathname.split('/')[1] as string;
  if (PUBLIC.test(pathname) || req.cookies.has(`sid_${portal}`)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/${portal}/login`;
  url.search = pathname === `/${portal}` ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*', '/teacher/:path*', '/parent/:path*', '/student/:path*'] };
