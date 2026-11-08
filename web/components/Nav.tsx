import { InlineScript } from './InlineScript';
import { ui } from '~/lib/copy';
import { liveRunFor, skills } from '~/lib/data';
import { API } from '~/lib/env';

const hasLive = skills.some((s) => liveRunFor(s.id));

const nav = [
    { href: '/', k: 'nav.matrix' },
    { href: '/compare/', k: 'nav.compare' },
    { href: '/about/', k: 'nav.about' },
] as const;

// aria-current is set in the browser (one layout for all pages; no client runtime).
const current = `(function () {
  var p = location.pathname.replace(/\\/?$/, '/');
  document.querySelectorAll('nav[aria-label="Main"] a[data-nav]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (h === '/' ? p === '/' : p.indexOf(h) === 0) a.setAttribute('aria-current', 'page');
  });
})();`;

export function Nav() {
    return (
        <nav aria-label="Main">
            {nav.map((n) => (
                <a key={n.href} href={n.href} data-nav="">
                    {ui[n.k]}
                </a>
            ))}
            {hasLive && (
                <a href="/live/" data-nav="">
                    {ui['nav.live']}
                </a>
            )}
            {API && <a href="/#waitlist">{ui['nav.waitlist']}</a>}
            <InlineScript code={current} />
        </nav>
    );
}
