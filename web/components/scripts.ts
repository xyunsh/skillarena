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

/** "Open live page" dialog: sandboxed iframe, previous / next through the page's live buttons, width toggle. */
export const liveDialogScript = `(function () {
  var dlg = document.getElementById('live-dialog');
  var frame = document.getElementById('live-frame');
  function setWidth(w) {
    dlg.dataset.width = w;
    dlg.querySelectorAll('[data-live-width]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-live-width') === w));
    });
  }
  var list = [], idx = 0;
  var prev = document.getElementById('live-prev'), next = document.getElementById('live-next');
  function show(i) {
    var btn = list[i];
    if (!btn) return;
    idx = i;
    frame.src = btn.getAttribute('data-live-src');
    document.getElementById('live-title').textContent = btn.getAttribute('data-live-title') || '';
    document.getElementById('live-count').textContent = list.length > 1 ? (i + 1) + ' / ' + list.length : '';
    prev.disabled = i <= 0;
    next.disabled = i >= list.length - 1;
    prev.hidden = next.hidden = list.length < 2;
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-live-src]');
    if (btn && !dlg.contains(btn)) {
      e.preventDefault();
      list = [].slice.call(document.querySelectorAll('[data-live-src]')).filter(function (b) { return !dlg.contains(b) && b.offsetParent !== null; });
      setWidth(btn.getAttribute('data-live-view') === 'mobile' ? 'mobile' : 'desktop');
      show(Math.max(0, list.indexOf(btn)));
      dlg.showModal();
      if (window.saTrack) saTrack('live_open', btn.getAttribute('data-live-title') || '');
      return;
    }
    var wb = e.target.closest && e.target.closest('[data-live-width]');
    if (wb) setWidth(wb.getAttribute('data-live-width'));
  });
  prev.addEventListener('click', function () { show(idx - 1); });
  next.addEventListener('click', function () { show(idx + 1); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' && !prev.disabled) { e.preventDefault(); show(idx - 1); }
    if (e.key === 'ArrowRight' && !next.disabled) { e.preventDefault(); show(idx + 1); }
  });
  document.getElementById('live-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () { frame.src = 'about:blank'; });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
})();`;
