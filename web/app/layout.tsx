import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { CoffeeLink } from '~/components/CoffeeLink';
import { GithubLink } from '~/components/GithubLink';
import { InlineScript } from '~/components/InlineScript';
import { Logo } from '~/components/Logo';
import { Nav } from '~/components/Nav';
import { liveDialogScript, trackingScript } from '~/components/scripts';
import { ui } from '~/lib/copy';
import { briefs, isMobileFirst, siteSettings } from '~/lib/data';
import { API } from '~/lib/env';
import { SITE } from '~/lib/seo';
import '~/styles/global.css';

export const metadata: Metadata = {
    metadataBase: new URL(SITE),
    icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' }, apple: '/apple-touch-icon.png' },
    alternates: {
        types: { 'text/plain': '/llms.txt', 'application/json': '/results.json' },
    },
};
export const viewport: Viewport = { themeColor: '#f6f6f4', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
    const banner = siteSettings.banner.enabled ? siteSettings.banner : null;
    return (
        <html lang="en">
            <head>
                <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
                <InlineScript code={trackingScript(API)} />
            </head>
            <body>
                <a className="skip" href="#main">
                    Skip to content
                </a>
                <header className="site-header">
                    <div className="wrap header-inner">
                        <Logo />
                        <Nav />
                        <div className="header-links">
                            <CoffeeLink />
                            <GithubLink />
                        </div>
                    </div>
                </header>
                {banner && (
                    <div className="site-banner" role="note">
                        <div className="wrap">{banner.href ? <a href={banner.href}>{banner.text} →</a> : banner.text}</div>
                    </div>
                )}
                <main id="main">{children}</main>
                <footer className="site-footer">
                    <div className="wrap">
                        <p>{ui['footer.note']}</p>
                        <p>
                            <a href="/about/">About &amp; disclaimer</a> · skillarena.dev
                        </p>
                    </div>
                </footer>

                <dialog id="live-dialog" aria-label="Generated page">
                    <div className="live-bar">
                        <div className="live-nav" role="group" aria-label="Browse generated pages">
                            <button type="button" className="btn" id="live-prev" aria-label="Previous page" title="Previous (←)">
                                ‹
                            </button>
                            <span className="live-count small" id="live-count" aria-live="polite"></span>
                            <button type="button" className="btn" id="live-next" aria-label="Next page" title="Next (→)">
                                ›
                            </button>
                        </div>
                        <span className="live-title" id="live-title"></span>
                        <div className="seg live-briefs" role="group" aria-label="Brief">
                            {briefs.map((b) => (
                                <button key={b.id} type="button" data-live-brief-tab={b.id} data-brief-title={b.title} data-mobile={isMobileFirst(b.id) ? '1' : undefined} aria-pressed="false">
                                    {b.title}
                                </button>
                            ))}
                        </div>
                        <button type="button" className="btn" id="live-close">
                            {ui['action.close']}
                        </button>
                    </div>
                    <div className="live-frame-wrap">
                        {/* sandbox without allow-same-origin: the generated page runs in an opaque origin and cannot reach this page. */}
                        <iframe id="live-frame" title="Generated page" sandbox="allow-scripts" referrerPolicy="no-referrer"></iframe>
                    </div>
                </dialog>
                <InlineScript code={liveDialogScript} />
            </body>
        </html>
    );
}
