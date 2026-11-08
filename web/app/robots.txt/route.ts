import { abs, text } from '~/lib/seo';

// Search engines and AI crawlers get the same rules: everything except the raw generated pages
// (untrusted model output, near-duplicate content). Their screenshots and preview images stay crawlable.
export const dynamic = 'force-static';

export const GET = () =>
  text(`User-agent: *
Allow: /
Disallow: /runs/
Allow: /runs/*.webp
Allow: /runs/*og.jpg
Disallow: /api/

Sitemap: ${abs('/sitemap.xml')}
# LLM-friendly summary: ${abs('/llms.txt')}
`);
