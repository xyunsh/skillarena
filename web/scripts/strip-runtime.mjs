// Post-build: removes the Next/React client runtime from the static export.
// Every page is server-rendered HTML and all interaction is the plain inline scripts (components/scripts.ts
// and the page scripts), so nothing needs hydrating. Without this, React hydration would discard what those
// scripts render (React error #418) and every page would ship ~175 KB of JS plus a second copy of its HTML.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('out');
const strip = (html) =>
    html
        .replace(/<script\b[^>]*\bsrc="\/_next\/[^"]*"[^>]*><\/script>/g, '')
        .replace(/<script id="_R_">[\s\S]*?<\/script>/g, '')
        .replace(/<script>(?:\(self\.__next_f|self\.__next_f)[\s\S]*?<\/script>/g, '')
        .replace(/<link\b[^>]*\bas="script"[^>]*\/?>/g, '');

let pages = 0, saved = 0, payloads = 0;
const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '_next' && e.name !== 'runs') walk(p); continue; } // runs/: generated pages, served unchanged
        if (e.name.endsWith('.html')) {
            const before = fs.readFileSync(p, 'utf8');
            const after = strip(before);
            if (/__next_f|\/_next\/static\/chunks\/[^"]*\.js/.test(after)) throw new Error(`runtime left in ${p}`);
            fs.writeFileSync(p, after);
            pages++;
            saved += before.length - after.length;
        } else if (/^(__next\..*|index)\.txt$/.test(e.name)) {
            fs.rmSync(p); // RSC payloads, only used by client navigation
            payloads++;
        }
    }
};
walk(OUT);
for (const f of fs.readdirSync(path.join(OUT, '_next/static/chunks'))) if (f.endsWith('.js')) fs.rmSync(path.join(OUT, '_next/static/chunks', f));
console.log(`strip-runtime: ${pages} page(s), ${(saved / 1024).toFixed(0)} KB of inline runtime removed, ${payloads} payload file(s) and the JS chunks deleted`);
