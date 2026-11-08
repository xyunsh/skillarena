/** Sanity check: the real manifest and settings parse, and sample bodies get the reference handlers' answers. */
import fs from 'node:fs';
import { Manifest, SiteSettings, TryBody, WaitlistBody, HitBody } from './index.ts';
import { normalizeSettings } from '../web/lib/settings.ts';

const fail: string[] = [];
const expect = (name: string, ok: boolean) => { if (!ok) fail.push(name); };
const m = Manifest.safeParse(JSON.parse(fs.readFileSync(process.argv[2] ?? 'web/data/manifest.json', 'utf8')));
expect(`manifest: ${m.success ? 'ok' : m.error.issues.slice(0, 3).map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`, m.success);
expect('settings: normalized defaults', SiteSettings.safeParse(normalizeSettings({})).success);
expect('settings: normalized junk', SiteSettings.safeParse(normalizeSettings({ order: ['A!', 'ok-id'], banner: { enabled: true, text: 'x', href: 'javascript:alert(1)' } })).success);
const w = WaitlistBody.safeParse({ email: ' Me@Example.com ', role: 'developer' });
expect('waitlist: no want → [tune], email lowercased', w.success && w.data.want.join() === 'tune' && w.data.email === 'me@example.com');
expect('waitlist: bad want', !WaitlistBody.safeParse({ email: 'a@b.co', role: 'other', want: 'x' }).success);
expect('waitlist: bad role', !WaitlistBody.safeParse({ email: 'a@b.co', role: 'boss' }).success);
expect('waitlist: ref cleaned', WaitlistBody.parse({ email: 'a@b.co', role: 'other', ref: 'X-1108' }).ref === 'x-1108' && WaitlistBody.parse({ email: 'a@b.co', role: 'other', ref: 'bad ref!' }).ref === '');
expect('try: ok', TryBody.safeParse({ email: 'a@b.co', role: 'lead', skills: 'a,b,a', brief: 'x'.repeat(20) }).success);
expect('try: 5 skills', !TryBody.safeParse({ email: 'a@b.co', role: 'lead', skills: 'a,b,c,d,e', brief: 'x'.repeat(20) }).success);
expect('try: short brief', !TryBody.safeParse({ email: 'a@b.co', role: 'lead', skills: 'a', brief: 'short' }).success);
expect('try: bad pay', !TryBody.safeParse({ email: 'a@b.co', role: 'lead', skills: 'a', brief: 'x'.repeat(20), pay: '100' }).success);
expect('hit: path must start with /', !HitBody.safeParse({ e: 'view', p: 'x' }).success && HitBody.safeParse({ p: '/' }).success);
if (fail.length) { console.error('✗ ' + fail.join('\n✗ ')); process.exit(1); }
console.log('contract: all checks pass');
