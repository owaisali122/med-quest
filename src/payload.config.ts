import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig, APIError, headersWithCors } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import type { Endpoint } from 'payload'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Forms } from './collections/Forms'
import { FormSubmissions } from './collections/FormSubmissions'
import { countryCityData } from './data/country-city-data'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const corsHeaders = () => {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return headers
}

const countryCitySearchEndpoint: Endpoint = {
  path: '/country-city/:query',
  method: 'get',
  handler: async (req) => {
    try {
      const query = req.routeParams?.query as string | undefined
      const headers = corsHeaders()

      if (!query || query.trim().length === 0) {
        return Response.json(
          { results: countryCityData },
          { headers: headersWithCors({ headers, req }) },
        )
      }

      const searchTerm = query.toLowerCase()
      const filteredResults = countryCityData.filter(
        (item) =>
          item.value.toLowerCase().includes(searchTerm) ||
          item.country.toLowerCase().includes(searchTerm) ||
          item.city.toLowerCase().includes(searchTerm),
      )

      return Response.json(
        { results: filteredResults },
        { headers: headersWithCors({ headers, req }) },
      )
    } catch (error) {
      req.payload.logger.error(`Error searching country-city data: ${error}`)
      throw new APIError('Failed to search country-city data', 500)
    }
  },
}

const countryCityQueryEndpoint: Endpoint = {
  path: '/country-city',
  method: 'get',
  handler: async (req) => {
    try {
      const headers = corsHeaders()

      if (!req.url) {
        return Response.json(
          { results: countryCityData },
          { headers: headersWithCors({ headers, req }) },
        )
      }

      const url = new URL(req.url)
      const query = url.searchParams.get('query') || ''

      if (!query || query.trim().length === 0) {
        return Response.json(
          { results: countryCityData },
          { headers: headersWithCors({ headers, req }) },
        )
      }

      const searchTerm = query.toLowerCase()
      const filteredResults = countryCityData.filter(
        (item) =>
          item.value.toLowerCase().includes(searchTerm) ||
          item.country.toLowerCase().includes(searchTerm) ||
          item.city.toLowerCase().includes(searchTerm),
      )

      return Response.json(
        { results: filteredResults },
        { headers: headersWithCors({ headers, req }) },
      )
    } catch (error) {
      req.payload.logger.error(`Error searching country-city data: ${error}`)
      throw new APIError('Failed to search country-city data', 500)
    }
  },
}

const countryCitySearchOptionsEndpoint: Endpoint = {
  path: '/country-city/:query',
  method: 'options',
  handler: async (req) => {
    return new Response(null, {
      status: 200,
      headers: headersWithCors({ headers: corsHeaders(), req }),
    })
  },
}

const countryCityQueryOptionsEndpoint: Endpoint = {
  path: '/country-city',
  method: 'options',
  handler: async (req) => {
    return new Response(null, {
      status: 200,
      headers: headersWithCors({ headers: corsHeaders(), req }),
    })
  },
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  cors: '*',
  collections: [Users, Media, Forms, FormSubmissions],
  endpoints: [
    countryCitySearchEndpoint,
    countryCityQueryEndpoint,
    countryCitySearchOptionsEndpoint,
    countryCityQueryOptionsEndpoint,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})
