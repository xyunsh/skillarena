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
 * Compare list ("cart"): skills added from the live dialog, kept in localStorage (per browser, up to 4), shown in a
 * floating tray at the bottom right. "Compare" opens /compare/ with them. window.saCmp is the API the dialog uses;
 * changes fire a 'sa-cmp' event on document. The tray moves into the dialog while it is open (a modal dialog is in
 * the top layer, so anything outside it is hidden and inert).
 */
export const compareTrayScript = `(function () {
  var KEY = 'sa_compare', MAX = 4;
  var tray = document.getElementById('cmp-tray'), panel = document.getElementById('cmp-tray-panel');
  var toggle = document.getElementById('cmp-tray-toggle'), listEl = document.getElementById('cmp-tray-list');
  var go = document.getElementById('cmp-tray-go'), autoClose = 0;
  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(function (x) { return x && typeof x.skill === 'string'; }).slice(0, MAX) : []; } catch (e) { return []; } }
  var items = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} }
  function idx(skill) { for (var i = 0; i < items.length; i++) if (items[i].skill === skill) return i; return -1; }
  function open(v) { panel.hidden = !v; toggle.setAttribute('aria-expanded', String(v)); }
  function href() {
    var last = items[items.length - 1] || {}, p = new URLSearchParams();
    if (items.length === 2) { p.set('a', items[0].skill); p.set('b', items[1].skill); }
    else p.set('skills', items.map(function (x) { return x.skill; }).join(','));
    if (last.brief) p.set('brief', last.brief);
    if (last.run && last.run !== '1') p.set('run', last.run);
    return '/compare/?' + p.toString();
  }
  function render() {
    tray.hidden = !items.length;
    toggle.querySelector('.cmp-tray-n').textContent = items.length;
    listEl.replaceChildren.apply(listEl, items.map(function (x) {
      var li = document.createElement('li'), a = document.createElement('a'), rm = document.createElement('button');
      a.href = '/skill/' + encodeURIComponent(x.skill) + '/'; a.textContent = x.name || x.skill;
      rm.type = 'button'; rm.className = 'cmp-tray-rm'; rm.setAttribute('data-cmp-rm', x.skill);
      rm.setAttribute('aria-label', 'Remove ' + (x.name || x.skill)); rm.textContent = '×';
      li.append(a, rm); return li;
    }));
    var ok = items.length >= 2;
    go.href = ok ? href() : '#';
    go.setAttribute('aria-disabled', String(!ok));
    document.getElementById('cmp-tray-hint').textContent = ok ? (items.length < MAX ? 'Add up to ' + MAX + ' skills.' : 'The list is full (' + MAX + ').') : 'Add one more skill to compare.';
    if (!items.length) open(false);
    document.dispatchEvent(new CustomEvent('sa-cmp'));
  }
  window.saCmp = {
    max: MAX,
    has: function (skill) { return idx(skill) >= 0; },
    full: function () { return items.length >= MAX; },
    toggle: function (it) {
      var i = idx(it.skill);
      if (i >= 0) items.splice(i, 1);
      else if (items.length < MAX) {
        items.push({ skill: it.skill, name: it.name || '', brief: it.brief || '', run: it.run || '1' });
        if (window.saTrack) saTrack('compare_add', it.skill);
        // Show the list for a moment so the add is visible; it folds back unless the pointer is on it.
        if (panel.hidden) { open(true); clearTimeout(autoClose); autoClose = setTimeout(function () { if (!tray.matches(':hover')) open(false); }, 2500); }
      }
      save(); render();
    },
  };
  toggle.addEventListener('click', function () { clearTimeout(autoClose); open(panel.hidden); });
  tray.addEventListener('click', function (e) {
    var rm = e.target.closest && e.target.closest('[data-cmp-rm]');
    if (rm) { var i = idx(rm.getAttribute('data-cmp-rm')); if (i >= 0) { items.splice(i, 1); save(); render(); } }
  });
  go.addEventListener('click', function (e) { if (go.getAttribute('aria-disabled') === 'true') e.preventDefault(); });
  document.getElementById('cmp-tray-clear').addEventListener('click', function () { items = []; save(); render(); });
  // Another tab changed the list.
  window.addEventListener('storage', function (e) { if (e.key === KEY) { items = load(); render(); } });
  var dlg = document.getElementById('live-dialog');
  new MutationObserver(function () { (dlg.open ? dlg : document.body).append(tray); }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  render();
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
    syncCmp();
  }
  // "Add to compare": the current skill into the compare list (compareTrayScript).
  var cmpBtn = document.getElementById('live-cmp');
  function syncCmp() {
    if (!cur || !window.saCmp) return;
    var on = saCmp.has(cur.skill);
    cmpBtn.setAttribute('aria-pressed', String(on));
    cmpBtn.disabled = !on && saCmp.full();
    cmpBtn.title = on ? 'Remove from the compare list' : cmpBtn.disabled ? 'The compare list is full (' + saCmp.max + ' skills)' : 'Add this skill to the compare list';
    cmpBtn.querySelector('.live-cmp-text').textContent = on ? 'In compare' : 'Add to compare';
  }
  cmpBtn.addEventListener('click', function () { if (cur && window.saCmp) saCmp.toggle(cur); });
  document.addEventListener('sa-cmp', syncCmp);
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
  // Full screen: the Fullscreen API on the dialog where available; otherwise (iOS Safari) the dialog fills the viewport.
  var full = document.getElementById('live-full');
  function isFull() { return document.fullscreenElement === dlg || dlg.classList.contains('is-max'); }
  function syncFull() { full.setAttribute('aria-pressed', String(isFull())); }
  function toggleFull() {
    if (document.fullscreenElement === dlg) document.exitFullscreen();
    else if (dlg.classList.contains('is-max')) dlg.classList.remove('is-max');
    else if (dlg.requestFullscreen) dlg.requestFullscreen().catch(function () { dlg.classList.add('is-max'); syncFull(); });
    else dlg.classList.add('is-max');
    syncFull();
  }
  full.addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', syncFull);
  dlg.addEventListener('keydown', function (e) {
    if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); toggleFull(); }
  });
  dlg.addEventListener('close', function () {
    if (document.fullscreenElement === dlg) document.exitFullscreen();
    dlg.classList.remove('is-max');
    syncFull();
  });
  document.getElementById('live-close').addEventListener('click', function () { dlg.close(); });
  // Following the skill link: close first, so a link to this same page (a skill page) lands on the section.
  document.getElementById('live-title').addEventListener('click', function (e) { if (e.target.closest('a')) dlg.close(); });
  dlg.addEventListener('close', function () { frame.src = 'about:blank'; });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
})();`;
