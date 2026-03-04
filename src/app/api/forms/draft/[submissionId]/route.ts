import configPromise from '@payload-config'
import { getPayload } from 'payload'

type RouteContext = { params: Promise<{ submissionId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { submissionId } = await context.params
  const payload = await getPayload({ config: configPromise })

  const doc = await payload.findByID({
    collection: 'form-submissions',
    id: submissionId,
    depth: 1,
  }).catch(() => null)

  if (!doc || doc.status !== 'draft') {
    return Response.json({ success: false, error: 'Draft not found' }, { status: 404 })
  }

  return Response.json({
    success: true,
    submissionId: doc.id,
    data: doc.data,
    form: typeof doc.form === 'object' ? doc.form : undefined,
  })
}

export async function PUT(request: Request, context: RouteContext) {
  const { submissionId } = await context.params
  let body: { data?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  const existing = await payload.findByID({
    collection: 'form-submissions',
    id: submissionId,
    depth: 0,
  }).catch(() => null)

  if (!existing || existing.status !== 'draft') {
    return Response.json({ success: false, error: 'Draft not found' }, { status: 404 })
  }

  const updated = await payload.update({
    collection: 'form-submissions',
    id: submissionId,
    data: {
      data: (body.data ?? existing.data) as Record<string, unknown>,
    },
  })

  return Response.json({
    success: true,
    submissionId: updated.id,
    message: 'Draft updated successfully',
  })
}
