import { JsonLd } from '~/components/JsonLd';
import { InlineScript } from '~/components/InlineScript';
import { ui } from '~/lib/copy';
import { briefs, manifest, siteSettings, skills } from '~/lib/data';
import { meta } from '~/lib/seo';

export const metadata = meta({
    title: 'Compare two UI skills side by side',
    description: 'Pick two UI skills and a brief to see the pages each one generated side by side, at desktop and mobile size, from the same brief and model.',
    path: '/compare/',
});

const data = {
    skills: skills.map((s) => ({ id: s.id, name: s.isBaseline ? null : s.name, isBaseline: s.isBaseline })),
    briefs: briefs.map((b) => ({ id: b.id, title: b.title, text: b.text })),
    runs: manifest.runs,
    runsPerPair: manifest.runsPerPair,
    text: {
        baseline: 'No skill (baseline)',
        failed: ui['status.failed'],
        invalid: ui['status.invalid_html'],
        missing: ui['status.missing'],
        open: ui['action.open'],
        details: 'Skill details',
    },
};
const has = (id: string) => !!id && skills.some((s) => s.id === id);
const defA = has(siteSettings.compare.a) ? siteSettings.compare.a : 'baseline';
const defB = has(siteSettings.compare.b) ? siteSettings.compare.b : (skills.find((s) => !s.isBaseline && s.id !== defA)?.id ?? 'baseline');
const runOptions = Array.from({ length: manifest.runsPerPair }, (_, i) => i + 1);

const script = `document.getElementById('cmp-form').addEventListener('submit', function (e) { e.preventDefault(); });
    (function () {
      var D = JSON.parse(document.getElementById('cmp-data').textContent);
      var $ = function (id) { return document.getElementById(id); };
      var selA = $('cmp-a'), selB = $('cmp-b'), selBrief = $('cmp-brief'), selRun = $('cmp-run');
      var state = { view: 'desktop' };
      var q = new URLSearchParams(location.search);
      var has = function (sel, v) { return [].some.call(sel.options, function (o) { return o.value === v; }); };
      if (q.get('a') && has(selA, q.get('a'))) selA.value = q.get('a');
      if (q.get('b') && has(selB, q.get('b'))) selB.value = q.get('b');
      if (q.get('brief') && has(selBrief, q.get('brief'))) selBrief.value = q.get('brief');
      if (q.get('run') && has(selRun, q.get('run'))) selRun.value = q.get('run');
      if (q.get('view') === 'mobile') state.view = 'mobile';
      // ?skills=a,b,c,… (from the compare list): 3–12 skills in a row of fixed-width panes that scrolls sideways;
      // 2 use the A / B pickers.
      var list = (q.get('skills') || '').split(',').filter(function (id, i, a) { return id && has(selA, id) && a.indexOf(id) === i; }).slice(0, 12);
      if (list.length === 2) { selA.value = list[0]; selB.value = list[1]; }
      if (list.length < 3) list = [];
      var grid = $('cmp-grid'), title = $('cmp-title'), title2 = title.textContent;

      function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function skillName(id) { var s = D.skills.find(function (x) { return x.id === id; }); return !s ? id : s.isBaseline ? D.text.baseline : s.name; }

      function renderPane(el, label, skillId) {
        var brief = selBrief.value, run = Number(selRun.value);
        var list = (D.runs[brief] || {})[skillId] || [];
        var r = list.find(function (x) { return x.run === run; });
        var title = skillName(skillId);
        var briefObj = D.briefs.find(function (b) { return b.id === brief; });
        var head = '<div class="pane-head"><h2 title="' + esc(title) + '">' + label + ' · ' + esc(title) + '</h2><span class="actions" style="display:flex;gap:6px">' +
          '<a class="btn" href="/skill/' + encodeURIComponent(skillId) + '/#' + encodeURIComponent(brief) + '">' + esc(D.text.details) + '</a>' +
          (r && r.hasShots ? '<button type="button" class="btn" data-live-src="' + r.base + 'index.html?v=' + r.v + '" data-live-skill="' + esc(skillId) + '" data-live-brief="' + esc(brief) + '" data-live-run="' + run + '" data-live-name="' + esc(title) + '">' + esc(D.text.open) + '</button>' : '') +
          '</span></div>';
        var body;
        if (r && r.hasShots) {
          var mobile = state.view === 'mobile';
          body = '<div class="pane-img' + (mobile ? ' m' : '') + '"><img src="' + r.base + (mobile ? 'mobile.webp' : 'desktop-full.webp') + '?v=' + r.v + '" alt="' + esc(title + ' — ' + briefObj.title + ', run ' + run) + '" width="' + (mobile ? 390 : 1440) + '" decoding="async"></div>';
        } else {
          var key = !r ? 'missing' : r.status === 'invalid_html' ? 'invalid' : 'failed';
          body = '<div class="status ' + (r ? 'status-failed' : 'status-missing') + '"' + (r && r.error ? ' title="' + esc(r.error) + '"' : '') + '>' + esc(D.text[key]) + '</div>';
        }
        el.innerHTML = head + body;
      }

      function render() {
        var multi = list.length >= 3, ids = multi ? list : [selA.value, selB.value];
        [selA, selB, $('cmp-swap')].forEach(function (el) { (el.closest('label') || el).hidden = multi; });
        title.textContent = multi ? 'Compare ' + (['', '', 'two', 'three', 'four', 'five', 'six'][list.length] || list.length) + ' skills' : title2;
        grid.className = 'compare-grid' + (multi ? ' compare-row' : '');
        while (grid.children.length > ids.length) grid.lastElementChild.remove();
        while (grid.children.length < ids.length) { var s = document.createElement('section'); s.className = 'pane'; s.setAttribute('aria-live', 'polite'); grid.append(s); }
        ids.forEach(function (id, i) {
          var el = grid.children[i];
          renderPane(el, String.fromCharCode(65 + i), id);
          if (multi) el.querySelector('.actions').insertAdjacentHTML('beforeend', '<button type="button" class="btn pane-rm" data-pane-rm="' + i + '" aria-label="Remove ' + esc(skillName(id)) + ' from the comparison" title="Remove">×</button>');
        });
        var b = D.briefs.find(function (x) { return x.id === selBrief.value; });
        $('cmp-brief-text').textContent = b ? b.text : '';
        document.querySelectorAll('[data-cmp-view]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-cmp-view') === state.view)); });
        var p = new URLSearchParams(multi ? { skills: list.join(','), brief: selBrief.value } : { a: selA.value, b: selB.value, brief: selBrief.value });
        if (selRun.value !== '1') p.set('run', selRun.value);
        if (state.view !== 'desktop') p.set('view', state.view);
        history.replaceState(null, '', '/compare/?' + p.toString());
        if (window.saTrack && window.__cmpSeen !== p.toString()) { if (window.__cmpSeen) saTrack('compare'); window.__cmpSeen = p.toString(); }
        var tryIds = ids.filter(function (id, i, a) { return id !== 'baseline' && a.indexOf(id) === i; });
        $('cmp-try').href = '/try/' + (tryIds.length ? '?skills=' + encodeURIComponent(tryIds.join(',')) : '');
      }

      [selA, selB, selBrief, selRun].forEach(function (s) { s.addEventListener('change', render); });
      grid.addEventListener('click', function (e) {
        var rm = e.target.closest && e.target.closest('[data-pane-rm]');
        if (!rm) return;
        list.splice(Number(rm.getAttribute('data-pane-rm')), 1);
        if (list.length === 2) { selA.value = list[0]; selB.value = list[1]; list = []; }
        render();
      });
      $('cmp-swap').addEventListener('click', function () { var t = selA.value; selA.value = selB.value; selB.value = t; render(); });
      document.querySelectorAll('[data-cmp-view]').forEach(function (b) {
        b.addEventListener('click', function () { state.view = b.getAttribute('data-cmp-view'); render(); });
      });
      render();
    })();
  `;

export default function Compare() {
    return (
        <div className="wrap">
            <JsonLd />
            <section className="hero" style={{ paddingBottom: 0 }}>
                <h1 id="cmp-title">{ui['compare.title']}</h1>
            </section>

            <form className="compare-controls" id="cmp-form">
                <label>
                    A{' '}
                    <select id="cmp-a" defaultValue={defA}>
                        {skills.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.isBaseline ? 'No skill (baseline)' : s.name}
                            </option>
                        ))}
                    </select>
                </label>
                <button type="button" className="btn" id="cmp-swap" aria-label="Swap A and B">
                    ⇄ {ui['compare.swap']}
                </button>
                <label>
                    B{' '}
                    <select id="cmp-b" defaultValue={defB}>
                        {skills.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.isBaseline ? 'No skill (baseline)' : s.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    {ui['compare.brief']}{' '}
                    <select id="cmp-brief">
                        {briefs.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.title}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    {ui['compare.run']}{' '}
                    <select id="cmp-run">
                        {runOptions.map((n) => (
                            <option key={n} value={n}>
                                #{n}
                            </option>
                        ))}
                    </select>
                </label>
                <div>
                    <span className="lbl small muted" style={{ display: 'block', marginBottom: 4 }}>
                        {ui['compare.view']}
                    </span>
                    <div className="seg" role="group">
                        <button type="button" data-cmp-view="desktop" aria-pressed="true">
                            {ui['view.desktop']}
                        </button>
                        <button type="button" data-cmp-view="mobile" aria-pressed="false">
                            {ui['view.mobile']}
                        </button>
                    </div>
                </div>
            </form>

            <p className="try-strip small">
                Want this comparison for your own product?{' '}
                <a className="btn" id="cmp-try" href="/try/">
                    Try these skills on your own brief →
                </a>
            </p>

            <blockquote className="brief-quote">
                <span className="lbl">{ui['brief.label']}</span>
                <span id="cmp-brief-text"></span>
            </blockquote>

            <div className="compare-grid" id="cmp-grid">
                <section className="pane" id="pane-a" aria-live="polite"></section>
                <section className="pane" id="pane-b" aria-live="polite"></section>
            </div>
            <script type="application/json" id="cmp-data" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
            <InlineScript code={script} />
        </div>
    );
}
