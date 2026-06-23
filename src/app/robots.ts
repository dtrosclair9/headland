import type { MetadataRoute } from 'next'
import { BASE_URL } from '@/lib/site'

// AI assistant / answer-engine crawlers we explicitly welcome, so Headland can
// be cited inside AI answers (ChatGPT, Claude, Perplexity, Google AI, etc.),
// not just ranked beneath them. The app + API are off-limits to everyone.
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'Google-Extended',
  'GoogleOther',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'CCBot',
  'Applebot',
  'Applebot-Extended',
  'Bytespider',
  'Amazonbot',
  'cohere-ai',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'YouBot',
  'Diffbot',
  'DuckAssistBot',
  'MistralAI-User',
]

export default function robots(): MetadataRoute.Robots {
  const disallow = ['/app/', '/api/']
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/', disallow })),
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
