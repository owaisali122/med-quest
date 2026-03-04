import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  const css = await readFile(
    join(process.cwd(), 'node_modules/formIoBuilder/node_modules/formiojs/dist/formio.full.min.css'),
    'utf-8',
  )
  return new NextResponse(css, {
    headers: {
      'Content-Type': 'text/css',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
