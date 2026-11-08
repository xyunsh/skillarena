import { jsonLd } from '~/lib/seo';

export function JsonLd({ items = [] }: { items?: Record<string, unknown>[] }) {
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(items) }} />;
}
