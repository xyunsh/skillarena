import { JsonLd } from '~/components/JsonLd';
import { meta } from '~/lib/seo';

export const metadata = meta({ title: 'Page not found', path: '/404/', noindex: true });

export default function NotFound() {
    return (
        <div className="wrap">
            <JsonLd />
            <section className="hero">
                <h1>Page not found</h1>
                <p className="muted">
                    That page doesn’t exist. <a href="/">Go to the matrix</a> or <a href="/compare/">compare two skills</a>.
                </p>
            </section>
        </div>
    );
}
