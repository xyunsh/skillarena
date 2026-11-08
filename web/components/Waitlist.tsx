import { InlineScript } from './InlineScript';
import { ui } from '~/lib/copy';
import { API } from '~/lib/env';

const roles = [
    ['author', 'wl.role.author'],
    ['developer', 'wl.role.developer'],
    ['designer', 'wl.role.designer'],
    ['lead', 'wl.role.lead'],
    ['other', 'wl.role.other'],
] as const;
const msgs = {
    sending: ui['wl.sending'], ok: ui['wl.ok'], dup: ui['wl.dup'], email: ui['wl.err.email'],
    role: ui['wl.err.role'], want: ui['wl.err.want'], rate: ui['wl.err.rate'], generic: ui['wl.err.generic'],
};

const script = `(function () {
  var msgs = ${JSON.stringify(msgs)}, api = ${JSON.stringify(API)};
  var form = document.getElementById('wl-form');
  var msg = document.getElementById('wl-msg');
  var btn = document.getElementById('wl-submit');
  function say(key, cls) { msg.textContent = msgs[key]; msg.className = 'form-msg ' + (cls || ''); }
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var email = String(fd.get('email') || '').trim();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)) { say('email', 'err'); form.email.focus(); return; }
    var want = fd.getAll('want').map(String);
    if (!want.length) { say('want', 'err'); return; }
    if (!fd.get('role')) { say('role', 'err'); return; }
    btn.disabled = true; say('sending');
    try {
      var res = await fetch(api + '/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email, role: fd.get('role'), want: want.join(','), need: String(fd.get('need') || ''), website: String(fd.get('website') || ''), ref: window.saRef ? saRef() : '' }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok) { if (!data.duplicate && window.saTrack) saTrack('waitlist_signup'); say(data.duplicate ? 'dup' : 'ok', 'ok'); form.reset(); }
      else if (res.status === 429) say('rate', 'err');
      else if (data.error === 'invalid_email') say('email', 'err');
      else if (data.error === 'invalid_role') say('role', 'err');
      else say('generic', 'err');
    } catch (err) { say('generic', 'err'); }
    btn.disabled = false;
  });
})();`;

/** Waitlist form; not rendered when no API is configured (NEXT_PUBLIC_API_URL). */
export function Waitlist() {
    if (!API) return null;
    return (
        <section className="waitlist" id="waitlist" aria-labelledby="wl-title">
            <div>
                <h2 id="wl-title">{ui['wl.title']}</h2>
                <p className="muted">{ui['wl.copy']}</p>
            </div>
            <form id="wl-form" noValidate>
                <div>
                    <label className="lbl" htmlFor="wl-email">
                        {ui['wl.email']} *
                    </label>
                    <input id="wl-email" name="email" type="email" required autoComplete="email" maxLength={254} placeholder="you@example.com" />
                </div>
                <fieldset className="want">
                    <legend>{ui['wl.want']} *</legend>
                    <label>
                        <input type="checkbox" name="want" value="updates" defaultChecked /> {ui['wl.want.updates']}
                    </label>
                    <label>
                        <input type="checkbox" name="want" value="tune" /> {ui['wl.want.tune']}
                    </label>
                </fieldset>
                <fieldset>
                    <legend>{ui['wl.role']} *</legend>
                    {roles.map(([v, k]) => (
                        <label key={v}>
                            <input type="radio" name="role" value={v} required /> {ui[k]}
                        </label>
                    ))}
                </fieldset>
                <div>
                    <label className="lbl" htmlFor="wl-need">
                        {ui['wl.need']}
                    </label>
                    <input id="wl-need" name="need" type="text" maxLength={280} />
                </div>
                <div className="hp" aria-hidden="true">
                    <label>
                        Website <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                    </label>
                </div>
                <div>
                    <button className="btn btn-primary" type="submit" id="wl-submit">
                        {ui['wl.submit']}
                    </button>
                </div>
                <p className="form-msg" id="wl-msg" role="status" aria-live="polite"></p>
            </form>
            <InlineScript code={script} />
        </section>
    );
}
