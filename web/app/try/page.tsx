import { JsonLd } from '~/components/JsonLd';
import { InlineScript } from '~/components/InlineScript';
import { skills } from '~/lib/data';
import { API } from '~/lib/env';
import { meta } from '~/lib/seo';

export const metadata = meta({
    title: 'Try your own brief',
    description: 'Pick UI skills, describe your product, and get a side-by-side comparison generated for your project.',
    path: '/try/',
});

// Custom comparisons are not built yet. This page records what people would compare (a "fake door"),
// and says so plainly before the form.
const choices = skills.filter((s) => !s.isBaseline);
const roles = [
    ['author', 'Skill author'],
    ['developer', 'Developer'],
    ['designer', 'Designer'],
    ['lead', 'Team lead'],
    ['other', 'Other'],
] as const;
const pays = [
    ['free', 'Only if it’s free'],
    ['1-5', '$1–5'],
    ['5-20', '$5–20'],
    ['20+', 'More than $20'],
] as const;

const script = `var api = API_JSON;
    (function () {
      var form = document.getElementById('try-form');
      var msg = document.getElementById('try-msg');
      var btn = document.getElementById('try-submit');
      var brief = document.getElementById('try-brief');
      var count = document.getElementById('try-count');
      var boxes = [].slice.call(form.querySelectorAll('input[name="skills"]'));
      var MAX = 4;

      // Preselect skills from ?skills=a,b (links from the compare page).
      var pre = (new URLSearchParams(location.search).get('skills') || '').split(',');
      boxes.forEach(function (b) { if (pre.indexOf(b.value) !== -1) b.checked = true; });

      function limit() {
        var n = boxes.filter(function (b) { return b.checked; }).length;
        boxes.forEach(function (b) { b.disabled = !b.checked && n >= MAX; });
      }
      boxes.forEach(function (b) { b.addEventListener('change', limit); });
      limit();
      brief.addEventListener('input', function () { count.textContent = brief.value.length; });

      function say(text, cls) { msg.textContent = text; msg.className = 'form-msg ' + (cls || ''); }
      var errors = {
        invalid_email: 'Please enter a valid email address.',
        invalid_role: 'Please choose who you are.',
        invalid_skills: 'Please pick between 1 and 4 skills.',
        invalid_brief: 'Please describe your product in at least 20 characters.',
      };

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var picked = fd.getAll('skills');
        var email = String(fd.get('email') || '').trim();
        var text = String(fd.get('brief') || '').trim();
        if (picked.length < 1) { say(errors.invalid_skills, 'err'); return; }
        if (text.length < 20) { say(errors.invalid_brief, 'err'); brief.focus(); return; }
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)) { say(errors.invalid_email, 'err'); form.email.focus(); return; }
        if (!fd.get('role')) { say(errors.invalid_role, 'err'); return; }
        btn.disabled = true; say('Sending…');
        try {
          var res = await fetch(api + '/try', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email: email, role: fd.get('role'), skills: picked.join(','), brief: text,
              pay: String(fd.get('pay') || ''), website: String(fd.get('website') || ''), ref: window.saRef ? saRef() : '',
            }),
          });
          var data = await res.json().catch(function () { return {}; });
          if (res.ok) {
            if (window.saTrack) saTrack('try_request', picked.join(','));
            say('Thanks — your request is saved. Custom comparisons aren’t live yet; we’ll email you when they are.', 'ok');
            form.reset(); count.textContent = '0'; limit();
          } else if (res.status === 429) say('Too many attempts. Please try again in a minute.', 'err');
          else say(errors[data.error] || 'Something went wrong. Please try again.', 'err');
        } catch (err) { say('Something went wrong. Please try again.', 'err'); }
        btn.disabled = false;
      });
    })();
  `.replace('API_JSON', JSON.stringify(API));

export default function Try() {
    return (
        <div className="wrap try">
            <JsonLd />
            <section className="hero" style={{ paddingBottom: 8 }}>
                <h1>Compare skills on your own brief</h1>
                <p className="muted">Pick the skills, describe your product, and get the same side-by-side comparison you see on this site, generated for your project.</p>
                <p className="note">
                    <strong>Not open yet.</strong> We’re checking whether people want this before building it. Tell us what you’d compare and we’ll email you when it opens. Nothing is generated or charged now.
                </p>
            </section>

            {!API ? (
                <p className="muted">Requests are collected on skillarena.dev; this build has no API configured.</p>
            ) : (
                <>
                    <form id="try-form" className="try-form" noValidate>
                        <fieldset className="skill-pick">
                            <legend>
                                Skills to compare <span className="muted small">(up to 4 — the no-skill baseline is always included)</span>
                            </legend>
                            {choices.map((s) => (
                                <label key={s.id} className="pick">
                                    <input type="checkbox" name="skills" value={s.id} />{' '}
                                    <span>
                                        <strong>{s.name}</strong>
                                        <span className="muted small">{s.author}</span>
                                    </span>
                                </label>
                            ))}
                            <label className="pick">
                                <input type="checkbox" name="skills" value="own" />{' '}
                                <span>
                                    <strong>My own skill</strong>
                                    <span className="muted small">I’d upload a SKILL.md</span>
                                </span>
                            </label>
                        </fieldset>

                        <div>
                            <label className="lbl" htmlFor="try-brief">
                                Your product brief *
                            </label>
                            <textarea
                                id="try-brief"
                                name="brief"
                                rows={6}
                                maxLength={2000}
                                required
                                placeholder="e.g. A booking page for a small yoga studio: class schedule for the week, instructor cards, pricing for drop-in and monthly passes, and a sign-up form."
                            ></textarea>
                            <p className="small muted counter">
                                <span id="try-count">0</span> / 2000 · Describe the page and what it should contain, like the <a href="/#briefs">briefs on the home page</a>.
                            </p>
                        </div>

                        <div className="try-row">
                            <div>
                                <label className="lbl" htmlFor="try-email">
                                    Email *
                                </label>
                                <input id="try-email" name="email" type="email" required autoComplete="email" maxLength={254} placeholder="you@example.com" />
                            </div>
                            <fieldset>
                                <legend>I am a… *</legend>
                                {roles.map(([v, l]) => (
                                    <label key={v}>
                                        <input type="radio" name="role" value={v} required /> {l}
                                    </label>
                                ))}
                            </fieldset>
                        </div>

                        <fieldset>
                            <legend>What would you pay for one comparison (up to 4 skills × 3 runs)?</legend>
                            {pays.map(([v, l]) => (
                                <label key={v}>
                                    <input type="radio" name="pay" value={v} /> {l}
                                </label>
                            ))}
                        </fieldset>

                        <div className="hp" aria-hidden="true">
                            <label>
                                Website <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                            </label>
                        </div>
                        <div>
                            <button className="btn btn-primary" type="submit" id="try-submit">
                                Request early access
                            </button>
                        </div>
                        <p className="form-msg" id="try-msg" role="status" aria-live="polite"></p>
                    </form>
                    <InlineScript code={script} />
                </>
            )}
        </div>
    );
}
