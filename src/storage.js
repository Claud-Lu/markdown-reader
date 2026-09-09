const KEY = 'markdown-reader-v2';
export const DEFAULT_SETTINGS = { theme: 'system', fontSize: 18, lineHeight: 1.85, width: 'standard', remember: true };
export function cleanSettings(raw = {}) {
  return {
    theme: ['system', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'system',
    fontSize: [16, 18, 20, 22].includes(raw.fontSize) ? raw.fontSize : 18,
    lineHeight: [1.65, 1.85, 2.05].includes(raw.lineHeight) ? raw.lineHeight : 1.85,
    width: ['standard', 'wide'].includes(raw.width) ? raw.width : 'standard',
    remember: raw.remember !== false,
  };
}
export function createStorage(storage) {
  let data = { settings: { ...DEFAULT_SETTINGS }, records: [] };
  try {
    const stored = JSON.parse(storage.getItem(KEY));
    if (stored && typeof stored === 'object') {
      data.settings = cleanSettings(stored.settings);
      if (data.settings.remember && Array.isArray(stored.records)) data.records = stored.records.filter(item => item && /^(?:[a-f\d]{64}|legacy-\d+)$/.test(item.id) && typeof item.title === 'string' && ['url', 'file', 'paste'].includes(item.kind)).slice(0, 20);
    } else {
      const legacy = JSON.parse(storage.getItem('md-reader-history') || '[]');
      if (Array.isArray(legacy)) data.records = legacy.slice(0, 20).flatMap((item, index) => {
        try {
          const url = new URL(item.url);
          if (!['https:', 'http:'].includes(url.protocol) || url.search || url.username || url.password) return [];
          return [{ id: `legacy-${index}`, title: String(item.title || url.hostname).slice(0, 120), kind: 'url', url: url.href, progress: 0, heading: '', updated: Number(item.time) || 0 }];
        } catch { return []; }
      });
    }
  } catch { /* Reading remains available when browser storage is blocked. */ }
  function persist() { try { storage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; } }
  return {
    settings: () => ({ ...data.settings }),
    records: () => data.records.map(item => ({ ...item })),
    settingsUpdate(values) {
      data.settings = cleanSettings({ ...data.settings, ...values });
      if (!data.settings.remember) data.records = [];
      return persist();
    },
    find: id => data.records.find(item => item.id === id),
    save(record) {
      if (!data.settings.remember) return false;
      let url = '';
      try { const parsed = new URL(record.url); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.search && !parsed.username && !parsed.password) { parsed.hash = ''; url = parsed.href; } } catch { /* Local document. */ }
      const previous = data.records.find(item => item.id === record.id);
      const item = { id: record.id, title: String(record.title || '未命名文档').slice(0, 120), kind: record.kind, url,
        progress: Math.max(0, Math.min(1, Number(record.progress ?? previous?.progress) || 0)),
        heading: typeof record.heading === 'string' ? record.heading : previous?.heading || '',
        updated: Date.now() };
      data.records = [item, ...data.records.filter(other => other.id !== item.id && !(url && other.url === url))].slice(0, 20);
      return persist();
    },
    remove(id) { data.records = data.records.filter(item => item.id !== id); return persist(); },
    clear() { data.records = []; try { storage.removeItem('md-reader-history'); } catch { /* Optional legacy data. */ } return persist(); },
  };
}
export async function documentId(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
