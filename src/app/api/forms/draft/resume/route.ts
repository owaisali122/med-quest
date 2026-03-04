import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const formId = searchParams.get('formId')
  const email = searchParams.get('email')
  if (!formId || !email) {
    return Response.json(
      { success: false, error: 'Missing formId or email' },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'form-submissions',
    where: {
      form: { equals: Number(formId) },
      status: { equals: 'draft' },
      email: { equals: email },
    },
    limit: 1,
    sort: '-updatedAt',
    depth: 1,
  })

  const draft = result.docs[0]
  if (!draft) {
    return Response.json({ success: false, error: 'No draft found' }, { status: 404 })
  }

  return Response.json({
    success: true,
    submissionId: draft.id,
    data: draft.data,
    form: typeof draft.form === 'object' ? draft.form : undefined,
  })
}
