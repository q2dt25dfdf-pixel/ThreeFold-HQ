import { NextRequest, NextResponse } from 'next/server'

const HQ_PREFIXES: string[] = [
  '/crm',
  '/clients',
  '/orders',
  '/tasks',
  '/finances',
  '/calendar',
  '/notes',
  '/vendors',
  '/reports',
  '/login',
]

const PORTAL_PREFIXES: string[] = [
  '/quote',
  '/deposit',
  '/invoice',
  '/portal',
]

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  if (pathname === '/') return false // handled separately
  return prefixes.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const { pathname } = request.nextUrl

  const isPortal = host === 'portal.threefoldsupply.com'
  const isHq     = host === 'hq.threefoldsupply.com'

  // Only enforce routing on the two known production subdomains.
  // vercel.app preview URLs and localhost pass through untouched.
  if (!isPortal && !isHq) return NextResponse.next()

  if (isPortal) {
    // Root and all HQ-internal paths redirect to hq.*
    const isRoot = pathname === '/'
    if (isRoot || matchesPrefix(pathname, HQ_PREFIXES)) {
      const url = new URL(request.url)
      url.host = 'hq.threefoldsupply.com'
      return NextResponse.redirect(url, 308)
    }
  }

  if (isHq) {
    // Client-facing document paths redirect to portal.*
    if (matchesPrefix(pathname, PORTAL_PREFIXES)) {
      const url = new URL(request.url)
      url.host = 'portal.threefoldsupply.com'
      return NextResponse.redirect(url, 308)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Exclude _next internals, static files, and all API routes.
    // API routes must remain reachable from both domains because
    // client-facing pages make relative /api/* fetch calls.
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|icons/|api/).*)',
  ],
}
