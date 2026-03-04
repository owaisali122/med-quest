import configPromise from '@payload-config'
import { getPayload } from 'payload'

type Body = {
  formId: number
  data: Record<string, unknown>
  currentTab?: string
  email?: string
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { formId, data, email } = body
  if (formId == null || !data || typeof data !== 'object') {
    return Response.json({ success: false, error: 'Missing formId or data' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  const form = await payload.findByID({
    collection: 'forms',
    id: Number(formId),
    depth: 0,
  })
  if (!form) {
    return Response.json({ success: false, error: 'Form not found' }, { status: 404 })
  }

  const existing = await payload.find({
    collection: 'form-submissions',
    where: {
      form: { equals: formId },
      status: { equals: 'draft' },
      ...(email ? { email: { equals: email } } : {}),
    },
    limit: 1,
    sort: '-updatedAt',
    depth: 0,
  })

  const draftData = {
    form: formId,
    data: data as Record<string, unknown>,
    status: 'draft' as const,
    ...(email ? { email } : {}),
  }

  if (existing.docs[0]) {
    const updated = await payload.update({
      collection: 'form-submissions',
      id: existing.docs[0].id,
      data: draftData,
    })
    return Response.json({
      success: true,
      submissionId: updated.id,
      message: 'Draft saved successfully',
    })
  }

  const created = await payload.create({
    collection: 'form-submissions',
    data: draftData,
  })
  return Response.json({
    success: true,
    submissionId: created.id,
    message: 'Draft saved successfully',
  })
}
