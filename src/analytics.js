export function createAnalytics() {
  let enabled = false; let visitorId; let sessionId;
  function send(event) {
    if (!enabled || !visitorId || !sessionId) return;
    let referrer = '';
    try { referrer = new URL(document.referrer).origin; } catch { /* Unknown source. */ }
    // Never send document contents, titles, filenames, source URLs or query strings.
    const body = JSON.stringify({ ...event, visitorId, sessionId, referrer });
    fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
  }
  const ready = fetch('/api/config', { signal: AbortSignal.timeout(4000) }).then(response => response.ok ? response.json() : {}).catch(() => ({})).then(config => {
    enabled = config.analyticsEnabled === true && navigator.webdriver !== true && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      && navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true;
    if (enabled) {
      let returning = false;
      try {
        visitorId = localStorage.getItem('reader-analytics-visitor'); returning = Boolean(visitorId);
        if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem('reader-analytics-visitor', visitorId); }
        const session = JSON.parse(localStorage.getItem('reader-analytics-session') || 'null');
        const sameSession = session && Date.now() - session.at < 30 * 60 * 1000;
        returning = returning && !sameSession;
        sessionId = sameSession ? session.id : crypto.randomUUID();
        localStorage.setItem('reader-analytics-session', JSON.stringify({ id: sessionId, at: Date.now() }));
      } catch { visitorId = crypto.randomUUID(); sessionId = crypto.randomUUID(); }
      send({ type: 'pageview' });
      if (returning) send({ type: 'custom', name: 'return_visit' });
    }
    return config;
  });
  return { ready, track(name, metadata = {}) { ready.then(() => send({ type: 'custom', name, source: metadata.source, reason: metadata.reason })); } };
}
