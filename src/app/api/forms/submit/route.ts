import configPromise from '@payload-config'
import { getPayload } from 'payload'

type Body = { formId?: number; formSlug?: string; data: Record<string, unknown> }

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { formId, formSlug, data } = body
  if (!data || (typeof data !== 'object')) {
    return Response.json({ success: false, error: 'Missing or invalid data' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  let formIdResolved: number
  if (formId != null) {
    formIdResolved = Number(formId)
  } else if (formSlug) {
    const found = await payload.find({
      collection: 'forms',
      where: { slug: { equals: formSlug }, status: { equals: 'published' } },
      limit: 1,
      depth: 0,
    })
    const form = found.docs[0]
    if (!form) {
      return Response.json({ success: false, error: 'Form not found' }, { status: 404 })
    }
    formIdResolved = typeof form.id === 'number' ? form.id : Number(form.id)
  } else {
    return Response.json({ success: false, error: 'Provide formId or formSlug' }, { status: 400 })
  }

  const form = await payload.findByID({
    collection: 'forms',
    id: formIdResolved,
    depth: 0,
  })
  if (!form || form.status !== 'published') {
    return Response.json({ success: false, error: 'Form not found or not published' }, { status: 404 })
  }

  const submission = await payload.create({
    collection: 'form-submissions',
    data: {
      form: formIdResolved,
      data: data as Record<string, unknown>,
      status: 'submitted',
    },
  })

  return Response.json({
    success: true,
    submissionId: submission.id,
    message: 'Form submitted successfully',
  })
}
