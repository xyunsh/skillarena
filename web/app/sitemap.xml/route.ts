import { manifest } from '~/lib/data';
import { abs, pages, text } from '~/lib/seo';

export const dynamic = 'force-static';

export function GET() {
  const lastmod = (manifest.lastGeneratedAt ?? manifest.builtAt ?? new Date().toISOString()).slice(0, 10);
  const urls = pages()
    .map((p) => `  <url><loc>${abs(p.path)}</loc><lastmod>${lastmod}</lastmod><priority>${p.priority.toFixed(1)}</priority></url>`)
    .join('\n');
  return text(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'application/xml');
}
