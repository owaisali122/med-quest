/**
 * Form.io API URL config. Used by the Form.io designer and any components
 * that need to resolve forms list or submission URLs.
 */
const baseUrl = typeof window !== 'undefined' ? '' : process.env.NEXT_PUBLIC_APP_URL ?? ''

export function getFormsListUrl(): string {
  return `${baseUrl}/api/forms`
}

export function getFormBySlugUrl(slug: string): string {
  return `${baseUrl}/api/forms/by-slug?slug=${encodeURIComponent(slug)}`
}
