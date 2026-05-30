import { NextResponse } from 'next/server'
import { getSignedUrls } from '@/lib/getSignedUrl'
import { validateSessionRequest } from '@/lib/sessionAuth'

export async function POST(request: Request) {
  const auth = await validateSessionRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: auth.status })
  }
  try {
    const body = await request.json()
    const paths: string[] = Array.isArray(body.paths)
      ? body.paths.filter((p: unknown) => typeof p === 'string' && (p as string).length > 0)
      : []

    if (paths.length === 0) return NextResponse.json({})

    const urls = await getSignedUrls(paths)
    return NextResponse.json(urls)
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}
