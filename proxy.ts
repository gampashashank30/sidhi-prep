// proxy.ts  (formerly middleware.ts — renamed in Next.js 16)
// Route protection proxy.
// Runs on every matched request BEFORE the page/route handler.
// Uses JWT-only verification (no DB lookup — keep proxy fast).
// The actual DB session + user-status check is done inside each route handler (guard.ts).

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';

export const config = {
  matcher: [
    // Protect the main app and all API routes
    '/',
    '/admin/:path*',
    '/api/parse/:path*',
    '/api/generate-pdf/:path*',
    '/api/preview-html/:path*',
    '/api/upload-image/:path*',
    '/api/upload-ad-pdf/:path*',
    '/api/upload-interlude-pdf/:path*',
    '/api/admin/:path*',
    // Auth pages — redirect logged-in users away from login
    '/login',
    '/forgot-password',
  ],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await getSessionFromRequest(req);

  // ── Auth pages: redirect authenticated users to the app ──────────────────────
  if (pathname === '/login' || pathname === '/forgot-password') {
    if (session) {
      const dest = session.role === 'admin' ? '/admin' : '/';
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // ── All other protected routes ────────────────────────────────────────────────
  if (!session) {
    // Unauthenticated API call — return 401 (don't redirect to /login for APIs)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Unauthenticated page request — redirect to login
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Admin-only routes ─────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (session.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
}
