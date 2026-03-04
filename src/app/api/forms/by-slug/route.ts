import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  if (!slug) {
    return Response.json({ success: false, error: 'Missing slug' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'forms',
    where: { slug: { equals: slug }, status: { equals: 'published' } },
    limit: 1,
    depth: 0,
  })

  const form = result.docs[0]
  if (!form) {
    return Response.json({ success: false, error: 'Form not found' }, { status: 404 })
  }

  return Response.json({
    success: true,
    form: {
      id: form.id,
      slug: form.slug,
      title: form.title,
      status: form.status,
    },
  })
}
