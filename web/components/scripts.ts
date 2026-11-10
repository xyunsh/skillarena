// Inline page scripts (vanilla JS; pages ship no framework runtime, see scripts/strip-runtime.mjs).

/** Cookie-free first-party analytics. Respects Do Not Track and Global Privacy Control. No API: a no-op. */
export const trackingScript = (api: string) => `(function () {
  try {
    var q = new URLSearchParams(location.search), ref = q.get('ref') || q.get('utm_source');
    if (ref && /^[a-z0-9._-]{1,40}$/i.test(ref)) sessionStorage.setItem('sa_ref', ref.toLowerCase());
    window.saRef = function () { try { return sessionStorage.getItem('sa_ref') || ''; } catch (e) { return ''; } };
    var api = ${JSON.stringify(api)};
    var off = !api || navigator.doNotTrack === '1' || navigator.globalPrivacyControl;
    var r = ''; try { r = document.referrer ? new URL(document.referrer).host : ''; } catch (e) {}
    if (r === location.host) r = '';
    window.saTrack = function (e, d) {
      if (off) return;
      var body = JSON.stringify({ e: e || 'view', p: location.pathname, q: location.pathname.indexOf('/compare') === 0 ? location.search.slice(0, 200) : '', r: r, ref: saRef(), w: innerWidth, d: d || '' });
      if (navigator.sendBeacon) navigator.sendBeacon(api + '/hit', new Blob([body], { type: 'application/json' }));
      else fetch(api + '/hit', { method: 'POST', body: body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(function () {});
    };
    saTrack('view');
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('a,[data-copy]') : null;
      if (!t) return;
      if (t.hasAttribute('data-copy')) return saTrack('copy_install', location.pathname);
      if (t.host && t.host !== location.host) saTrack('outbound', (t.host + t.pathname).slice(0, 120));
    }, true);
  } catch (e) {}
})();`;

/**
 * "Open live page" dialog: sandboxed iframe with one tab per brief.
 * Every element with data-live-skill / data-live-brief / data-live-run and a source (data-live-src, which opens
 * the dialog on click, or data-live-href, a plain link) registers a page. The tabs switch the brief for the same
 * skill and run; previous / next move through the other pages of the current brief (skills on the matrix, runs
 * on a skill page). Mobile-first briefs open at phone width.
 */
export const liveDialogScript = `(function () {
  var dlg = document.getElementById('live-dialog');
  var frame = document.getElementById('live-frame');
  var prev = document.getElementById('live-prev'), next = document.getElementById('live-next');
  var tabs = [].slice.call(dlg.querySelectorAll('[data-live-brief-tab]'));
  var pages = [], cur = null;
  function src(el) { return el.getAttribute('data-live-src') || el.getAttribute('data-live-href'); }
  function collect() {
    pages = [].slice.call(document.querySelectorAll('[data-live-skill]')).filter(function (el) { return !dlg.contains(el) && src(el) && !el.closest('[hidden]'); }).map(function (el) {
      return { el: el, skill: el.getAttribute('data-live-skill'), brief: el.getAttribute('data-live-brief'), run: el.getAttribute('data-live-run'), name: el.getAttribute('data-live-name') || '', src: src(el) };
    });
  }
  function find(skill, brief, run) {
    var any = null;
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      if (p.skill !== skill || p.brief !== brief) continue;
      if (p.run === run) return p;
      if (!any) any = p;
    }
    return any;
  }
  // Pages of the current brief: one per skill (same run) when the page shows several skills, else every run.
  function inBrief() {
    var all = pages.filter(function (p) { return p.brief === cur.brief; });
    var skills = all.map(function (p) { return p.skill; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var list = skills.length > 1 ? skills.map(function (k) { return find(k, cur.brief, cur.run); }) : all;
    return list.filter(function (p, i, a) { return p && a.findIndex(function (q) { return q && q.skill === p.skill && q.run === p.run; }) === i; });
  }
  function show(p) {
    if (!p) return;
    cur = p;
    frame.src = p.src;
    var tab = tabs.filter(function (t) { return t.getAttribute('data-live-brief-tab') === p.brief; })[0];
    dlg.dataset.width = tab && tab.getAttribute('data-mobile') ? 'mobile' : 'desktop';
    tabs.forEach(function (t) {
      var b = t.getAttribute('data-live-brief-tab');
      t.setAttribute('aria-pressed', String(b === p.brief));
      t.disabled = !find(p.skill, b, p.run);
    });
    // Title: the skill name links to its detail page (at this brief), then brief and run.
    var title = document.getElementById('live-title');
    title.replaceChildren();
    var a = document.createElement('a');
    a.className = 'live-skill';
    a.href = '/skill/' + encodeURIComponent(p.skill) + '/#' + encodeURIComponent(p.brief);
    a.textContent = p.name || p.skill;
    title.append(a, document.createTextNode(' · ' + (tab ? tab.getAttribute('data-brief-title') : p.brief) + ' · run ' + p.run));
    var list = inBrief(), i = list.indexOf(p);
    if (i < 0) i = list.findIndex(function (q) { return q.skill === p.skill; });
    document.getElementById('live-count').textContent = list.length > 1 ? (i + 1) + ' / ' + list.length : '';
    prev.disabled = i <= 0;
    next.disabled = i >= list.length - 1;
    prev.hidden = next.hidden = list.length < 2;
  }
  function step(d) {
    var list = inBrief(), i = list.findIndex(function (q) { return q.skill === cur.skill && q.run === cur.run; });
    if (i < 0) i = list.findIndex(function (q) { return q.skill === cur.skill; });
    show(list[i + d]);
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-live-src]');
    if (btn && !dlg.contains(btn)) {
      e.preventDefault();
      collect();
      show(pages.filter(function (p) { return p.el === btn; })[0]);
      dlg.showModal();
      if (window.saTrack) saTrack('live_open', document.getElementById('live-title').textContent);
      return;
    }
    var tab = e.target.closest && e.target.closest('[data-live-brief-tab]');
    if (tab && cur && !tab.disabled) show(find(cur.skill, tab.getAttribute('data-live-brief-tab'), cur.run));
  });
  prev.addEventListener('click', function () { step(-1); });
  next.addEventListener('click', function () { step(1); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' && !prev.disabled) { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight' && !next.disabled) { e.preventDefault(); step(1); }
  });
  document.getElementById('live-close').addEventListener('click', function () { dlg.close(); });
  // Following the skill link: close first, so a link to this same page (a skill page) lands on the section.
  document.getElementById('live-title').addEventListener('click', function (e) { if (e.target.closest('a')) dlg.close(); });
  dlg.addEventListener('close', function () { frame.src = 'about:blank'; });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
})();`;
