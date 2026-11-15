/* Stellog web tracker. No cookies. One pageview per page load. */
(function () {
  var el = document.currentScript;
  if (!el) return;
  var site = el.getAttribute('data-site');
  if (!site) return;
  var endpoint = new URL('/collect', el.src).toString();
  var storageKey = 'sl:' + site;
  var fresh = false;
  try { fresh = !sessionStorage.getItem(storageKey); if (fresh) sessionStorage.setItem(storageKey, '1'); } catch (e) { fresh = true; }
  var body = JSON.stringify({
    site: site,
    path: location.pathname || '/',
    referrer: document.referrer || '',
    title: document.title || '',
    language: navigator.language || '',
    screen: (screen.width || 0) + 'x' + (screen.height || 0),
    newSession: fresh
  });
  var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
  if (!navigator.sendBeacon || !navigator.sendBeacon(endpoint, blob)) {
    fetch(endpoint, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: body, keepalive: true, mode: 'cors' });
  }
})();
