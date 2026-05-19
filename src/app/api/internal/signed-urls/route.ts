import { NextResponse } from 'next/server'
import { getSignedUrls } from '@/lib/getSignedUrl'

export async function POST(request: Request) {
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
