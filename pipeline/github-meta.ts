/**
 * GitHub facts for every skill repo: owner (login, display name, profile link), avatar, star count.
 * Writes web/data/github.json and downloads each owner's avatar (96 px) into web/public/avatars/<login>.png,
 * so the site serves avatars itself and visitors never load images from GitHub.
 *
 * Usage: yarn github-meta [-- --skill a,b]
 * Uses GITHUB_TOKEN from .env when set (60 requests an hour without one is enough for ~50 repos).
 * Text from GitHub (names) is third-party data; it is stored as-is and rendered escaped by the site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BASELINE_ID, DATA_DIR, PUBLIC_DIR, loadEnv, loadSkills, parseCli } from './lib.ts';

export type GithubRepo = {
    repo: string;
    owner: { login: string; name: string | null; type: 'User' | 'Organization'; url: string; avatar: string | null };
    stars: number;
    fetchedAt: string;
};

loadEnv();
const OUT = path.join(DATA_DIR, 'github.json');
const AVATARS = path.join(PUBLIC_DIR, 'avatars');
fs.mkdirSync(AVATARS, { recursive: true });
const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'SkillArena-github-meta' };
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const getJson = async (url: string) => {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json() as Promise<any>;
};

const cli = parseCli();
const prev: Record<string, GithubRepo> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).repos ?? {} : {};
const repos = new Map<string, string>(); // "owner/repo" → github url
for (const s of loadSkills()) {
    if (s.id === BASELINE_ID || (cli.skills.length && !cli.skills.includes(s.id))) continue;
    const m = /github\.com\/([^/]+)\/([^/.]+)/.exec(s.repo ?? '');
    if (m) repos.set(`${m[1]}/${m[2]}`.toLowerCase(), `${m[1]}/${m[2]}`);
}

const out: Record<string, GithubRepo> = { ...prev };
const owners = new Map<string, any>();
let ok = 0, failed = 0;
for (const [key, full] of repos) {
    try {
        const r = await getJson(`https://api.github.com/repos/${full}`);
        const login: string = r.owner.login;
        if (!owners.has(login)) owners.set(login, await getJson(`https://api.github.com/users/${login}`).catch(() => ({})));
        const u = owners.get(login);
        let avatar: string | null = null;
        const file = path.join(AVATARS, `${login.toLowerCase()}.png`);
        try {
            const img = await fetch(`${r.owner.avatar_url}${r.owner.avatar_url.includes('?') ? '&' : '?'}s=96`, { headers: { 'user-agent': headers['user-agent'] } });
            if (img.ok && /^image\//.test(img.headers.get('content-type') ?? '')) {
                fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()));
                avatar = `/avatars/${login.toLowerCase()}.png`;
            }
        } catch {}
        if (!avatar && fs.existsSync(file)) avatar = `/avatars/${login.toLowerCase()}.png`;
        out[key] = {
            repo: r.full_name,
            owner: { login, name: typeof u.name === 'string' && u.name.trim() ? u.name.trim().slice(0, 80) : null, type: r.owner.type === 'Organization' ? 'Organization' : 'User', url: r.owner.html_url, avatar },
            stars: r.stargazers_count,
            fetchedAt: new Date().toISOString(),
        };
        ok++;
    } catch (e) {
        failed++;
        console.error(`✗ ${full}: ${(e as Error).message}`);
    }
}
fs.writeFileSync(OUT, JSON.stringify({ checkedAt: new Date().toISOString(), repos: Object.fromEntries(Object.entries(out).sort()) }, null, 2) + '\n');
console.log(`${ok} repo(s) updated, ${failed} failed, ${owners.size} owner(s); wrote ${path.relative(process.cwd(), OUT)}`);
if (failed) process.exitCode = 1;
