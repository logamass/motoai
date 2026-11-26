import type { MetadataRoute } from 'next'

function getSiteUrl(): string {
  const raw =
    process.env.WEB_APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
