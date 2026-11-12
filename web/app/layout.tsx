import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { CoffeeLink } from '~/components/CoffeeLink';
import { GithubLink } from '~/components/GithubLink';
import { InlineScript } from '~/components/InlineScript';
import { Logo } from '~/components/Logo';
import { Nav } from '~/components/Nav';
import { compareTrayScript, liveDialogScript, trackingScript } from '~/components/scripts';
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
    // Bing Webmaster Tools site verification (keep it, or the site becomes unverified).
    verification: { other: { 'msvalidate.01': 'AB4458953E731726605E5088E0C4367D' } },
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

                <dialog id="live-dialog" aria-label="Generated page" tabIndex={-1}>
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
                        <button type="button" className="btn" id="live-full" aria-pressed="false" title="Full screen (F)">
                            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                            </svg>
                            <span className="live-full-text">{ui['action.fullscreen']}</span>
                        </button>
                        <button type="button" className="btn" id="live-close">
                            {ui['action.close']}
                        </button>
                    </div>
                    <div className="live-frame-wrap">
                        {/* sandbox without allow-same-origin: the generated page runs in an opaque origin and cannot reach this page. */}
                        <iframe id="live-frame" title="Generated page" sandbox="allow-scripts" referrerPolicy="no-referrer"></iframe>
                    </div>
                </dialog>
                <aside id="cmp-tray" className="cmp-tray" aria-label="Compare list" hidden>
                    <div id="cmp-tray-panel" className="cmp-tray-panel" hidden>
                        <div className="cmp-tray-head">
                            <strong>Compare list</strong>
                            <button type="button" className="cmp-tray-clear" id="cmp-tray-clear">
                                Clear
                            </button>
                        </div>
                        <ol id="cmp-tray-list" className="cmp-tray-list"></ol>
                        <p className="cmp-tray-hint small muted" id="cmp-tray-hint"></p>
                        <a className="btn btn-primary cmp-tray-go" id="cmp-tray-go" href="/compare/">
                            Compare side by side →
                        </a>
                    </div>
                    <div className="cmp-tray-row">
                        <button type="button" className="cmp-tray-add" id="live-cmp" aria-pressed="false" hidden>
                            <svg className="live-cmp-plus" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            <svg className="live-cmp-check" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                            <span className="live-cmp-text">Add to compare</span>
                        </button>
                        <button type="button" className="cmp-tray-pill" id="cmp-tray-toggle" aria-expanded="false" aria-controls="cmp-tray-panel">
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="7.5" height="16" rx="1.5" />
                                <rect x="13.5" y="4" width="7.5" height="16" rx="1.5" />
                            </svg>
                            Compare
                            <span className="cmp-tray-n">0</span>
                        </button>
                    </div>
                </aside>
                <InlineScript code={compareTrayScript} />
                <InlineScript code={liveDialogScript} />
            </body>
        </html>
    );
}
