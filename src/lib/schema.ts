// Structured-data (JSON-LD) builders. Centralized so every page emits the same
// canonical Organization / WebSite / SoftwareApplication identity and so FAQ
// schema always matches the visible FAQ content on the page.
import { BASE_URL, SITE_NAME, SITE_TAGLINE } from '@/lib/site'

const ORG_ID = `${BASE_URL}/#organization`

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    url: BASE_URL,
    logo: `${BASE_URL}/logo.png`,
    description: SITE_TAGLINE,
    areaServed: ['Louisiana', 'Florida'],
    parentOrganization: { '@type': 'Organization', name: 'Strykora' },
  }
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE_URL}/#website`,
    url: BASE_URL,
    name: SITE_NAME,
    publisher: { '@id': ORG_ID },
  }
}

export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Sugarcane field mapping & records',
    operatingSystem: 'Web, iOS, Android (browser)',
    url: BASE_URL,
    publisher: { '@id': ORG_ID },
    offers: {
      '@type': 'Offer',
      price: '0.50',
      priceCurrency: 'USD',
      description: '$0.50 per acre, per year. 14-day free trial, no setup fee.',
    },
  }
}

export function faqPageSchema(faqs: ReadonlyArray<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

// BreadcrumbList for nested pages. items: [{name, url}] in order, root first.
export function breadcrumbSchema(items: ReadonlyArray<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }
}
