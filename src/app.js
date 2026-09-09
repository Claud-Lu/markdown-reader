import './style.css';
import { createRenderer, enhanceDiagrams } from './renderer.js';
import { createStorage, documentId } from './storage.js';
import { DocumentError, MAX_DOCUMENT_BYTES, normalizeDocumentUrl, readBoundedText } from './document.js';
import { createAnalytics } from './analytics.js';
import { SAMPLE } from './sample.js';

const $ = id => document.getElementById(id);
let localStore;
try { localStore = window.localStorage; } catch { localStore = { getItem: () => null, setItem: () => { throw new Error('Unavailable'); }, removeItem: () => {} }; }
const storage = createStorage(localStore);
const renderDocument = createRenderer(window);
const analytics = createAnalytics();
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const state = { current: null, controller: null, loadId: 0, headings: [], anchors: new Map(), pendingResume: null, activeHeading: '', loading: false, progress: 0, maxProgress: 0, seconds: 0, engaged: false };
let toastTimer; let scrollTimer; let storageWarned = false; let lastTheme;
$('importMount').append($('importPanel'));

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function checkStorage(ok) { if (!ok && storage.settings().remember && !storageWarned) { storageWarned = true; toast('浏览器暂时无法保存记录，本次阅读仍可正常使用。'); } }
function track(name, metadata = {}) { if (state.current?.kind !== 'sample') analytics.track(name, { source: state.current?.kind, ...metadata }); }
function resolvedTheme() { const theme = storage.settings().theme; return theme === 'system' ? systemTheme.matches ? 'dark' : 'light' : theme; }
function applySettings() {
  const settings = storage.settings(); const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.style.setProperty('--reader-size', `${settings.fontSize}px`);
  root.style.setProperty('--reader-leading', settings.lineHeight);
  root.style.setProperty('--reader-width', settings.width === 'wide' ? '1080px' : '800px');
  document.querySelectorAll('[data-setting]').forEach(button => button.setAttribute('aria-pressed', String(settings[button.dataset.setting] === (['fontSize', 'lineHeight'].includes(button.dataset.setting) ? Number(button.dataset.value) : button.dataset.value))));
  $('rememberInput').checked = settings.remember;
  if (lastTheme && lastTheme !== root.dataset.theme && state.current && !state.loading) refreshDiagrams();
  lastTheme = root.dataset.theme;
}
function refreshDiagrams() {
  state.controller?.abort(); state.controller = new AbortController();
  for (const frame of $('content').querySelectorAll('.diagram-frame')) {
    frame.querySelectorAll('img[data-diagram-image]').forEach(image => URL.revokeObjectURL(image.src));
    frame.querySelector('.diagram-preview')?.remove();
    const details = frame.querySelector('details');
    if (details) { const pre = details.querySelector('pre'); if (pre) frame.append(pre); details.remove(); }
    frame.querySelector('.diagram-note')?.remove();
    const code = frame.querySelector('code'); if (code) code.dataset.diagram = 'pending';
  }
  enhanceDiagrams($('content'), resolvedTheme(), state.controller.signal).catch(() => {});
}
applySettings(); systemTheme.addEventListener('change', applySettings);
function selectImport(mode) {
  document.querySelectorAll('[data-import]').forEach(button => {
    const selected = button.dataset.import === mode;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    $(`${button.dataset.import}Panel`).hidden = !selected;
  });
  $('importError').hidden = true;
}
function selectSide(mode) {
  document.querySelectorAll('[data-side]').forEach(button => {
    const selected = button.dataset.side === mode;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    $(`${button.dataset.side}Panel`).hidden = !selected;
  });
}
function tabKeyboard(event, selector, activate) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll(selector)];
  const index = buttons.indexOf(document.activeElement); if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  activate(buttons[next]); buttons[next].focus();
}
document.querySelector('.import-tabs').addEventListener('keydown', event => tabKeyboard(event, '[data-import]', button => selectImport(button.dataset.import)));
document.querySelector('.side-tabs').addEventListener('keydown', event => tabKeyboard(event, '[data-side]', button => selectSide(button.dataset.side)));
document.querySelectorAll('[data-import]').forEach(button => button.addEventListener('click', () => selectImport(button.dataset.import)));
document.querySelectorAll('[data-side]').forEach(button => button.addEventListener('click', () => selectSide(button.dataset.side)));

function openDocument(mode = 'paste') {
  selectImport(mode);
  if (!$('reader').hidden) { $('dialogImportMount').append($('importPanel')); $('openDialog').showModal(); }
  else $('importPanel').scrollIntoView({ block: 'center' });
  if (mode !== 'file') $(`${mode}Input`).focus();
}
$('openDialog').addEventListener('close', () => $('importMount').append($('importPanel')));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
}));
$('newButton').addEventListener('click', () => openDocument());
$('settingsButton').addEventListener('click', () => $('settingsDialog').showModal());
document.querySelectorAll('.privacy-open').forEach(button => button.addEventListener('click', () => $('privacyDialog').showModal()));
document.querySelectorAll('[data-setting]').forEach(button => button.addEventListener('click', () => {
  const { setting, value } = button.dataset;
  checkStorage(storage.settingsUpdate({ [setting]: ['fontSize', 'lineHeight'].includes(setting) ? Number(value) : value })); applySettings();
}));
$('rememberInput').addEventListener('change', event => {
  checkStorage(storage.settingsUpdate({ remember: event.target.checked }));
  if (!event.target.checked) { storage.clear(); state.pendingResume = null; $('resumeNotice').hidden = true; }
  renderRecent();
});

function sidebar(open) {
  $('sidebar').classList.toggle('open', open); $('sidebarBackdrop').hidden = !open;
  $('sidebar').inert = innerWidth <= 900 && !open;
  document.querySelector('.reading-column').inert = innerWidth <= 900 && open;
  $('sidebarButton').setAttribute('aria-expanded', String(open));
  if (open) { if (innerWidth > 900) { document.body.classList.remove('focus-mode'); $('focusButton').textContent = '专注'; $('focusButton').setAttribute('aria-pressed', 'false'); } $('tocTab').focus(); }
}
$('sidebarButton').addEventListener('click', () => sidebar(!$('sidebar').classList.contains('open')));
$('closeSidebar').addEventListener('click', () => { sidebar(false); $('sidebarButton').focus(); });
$('sidebarBackdrop').addEventListener('click', () => sidebar(false));
$('focusButton').addEventListener('click', () => {
  const active = document.body.classList.toggle('focus-mode');
  $('focusButton').textContent = active ? '退出专注' : '专注'; $('focusButton').setAttribute('aria-pressed', String(active)); sidebar(false);
});
function scrollHeading(id, updateHash = true) {
  const resolved = state.anchors.get(id) || id;
  const heading = [...$('content').querySelectorAll('h1,h2,h3,h4,h5,h6')].find(node => node.id === resolved);
  if (!heading) return false;
  state.pendingResume = null; $('resumeNotice').hidden = true;
  heading.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  if (updateHash) { const address = new URL(location.href); address.hash = resolved; history.replaceState(null, '', address); }
  sidebar(false); return true;
}
function buildToc(headings) {
  $('toc').replaceChildren(); $('noHeadings').hidden = headings.length > 0;
  const minLevel = headings.length ? Math.min(...headings.map(item => item.level)) : 1;
  for (const heading of headings) {
    const link = document.createElement('a'); link.className = 'toc-link'; link.href = `#${heading.id}`; link.textContent = heading.text;
    link.style.paddingLeft = `${9 + Math.min(heading.level - minLevel, 4) * 12}px`;
    link.addEventListener('click', event => { event.preventDefault(); scrollHeading(heading.id); }); $('toc').append(link);
  }
}
function renderRecent() {
  const records = storage.records(); $('homeRecent').hidden = !records.length;
  for (const [container, limit] of [[$('recentList'), 20], [$('homeRecentList'), 3]]) {
    container.replaceChildren();
    if (!records.length) { const note = document.createElement('p'); note.className = 'empty-note'; note.textContent = '打开一篇文档后，阅读记录会出现在这里。'; container.append(note); }
    for (const record of records.slice(0, limit)) {
      const row = document.createElement('div'); row.className = 'recent-row';
      const open = document.createElement('button'); open.className = 'recent-open';
      const title = document.createElement('span'); title.className = 'recent-title'; title.textContent = record.title;
      const meta = document.createElement('span'); meta.className = 'recent-meta';
      const type = { url: record.url ? '链接文档' : '链接未保存', file: '本地文件', paste: '粘贴文本' }[record.kind];
      meta.textContent = `${type} · 已读 ${Math.round((record.progress || 0) * 100)}%`;
      open.append(title, meta); open.addEventListener('click', () => {
        if (record.kind === 'url' && record.url) { $('urlInput').value = record.url; load({ kind: 'url', url: record.url }); }
        else { openDocument(record.kind); toast(record.kind === 'file' ? '重新选择相同文件，即可找回阅读位置。' : '重新打开相同内容，即可找回阅读位置。'); if (record.kind === 'file') $('fileInput').click(); }
      });
      const remove = document.createElement('button'); remove.className = 'icon-button'; remove.textContent = '×'; remove.setAttribute('aria-label', `移除阅读记录：${record.title}`);
      remove.addEventListener('click', () => { storage.remove(record.id); if (state.current?.id === record.id) state.current.recordRemoved = true; renderRecent(); }); row.append(open, remove); container.append(row);
    }
  }
  $('clearRecent').hidden = !records.length;
}
$('clearRecent').addEventListener('click', () => { storage.clear(); if (state.current) state.current.recordRemoved = true; state.pendingResume = null; $('resumeNotice').hidden = true; renderRecent(); toast('此浏览器的阅读记录已清空。'); });

function saveProgress() {
  if (!state.current || state.current.kind === 'sample' || state.current.recordRemoved || state.loading || state.pendingResume) return;
  checkStorage(storage.save({ ...state.current, progress: state.progress, heading: state.activeHeading }));
}
function updateProgress() {
  if ($('reader').hidden || !state.current) return;
  const contentTop = $('content').getBoundingClientRect().top + scrollY;
  const total = Math.max(1, document.documentElement.scrollHeight - innerHeight - contentTop);
  state.progress = Math.min(1, Math.max(0, (scrollY - contentTop) / total));
  if (document.documentElement.scrollHeight <= innerHeight + 3) state.progress = 1;
  state.maxProgress = Math.max(state.maxProgress, state.progress);
  $('readingProgress').style.width = `${state.progress * 100}%`; $('progressLabel').textContent = `已读 ${Math.round(state.progress * 100)}%`;
  const headings = [...$('content').querySelectorAll('h1,h2,h3,h4,h5,h6')];
  state.activeHeading = headings.findLast(heading => heading.getBoundingClientRect().top <= 125)?.id || headings[0]?.id || '';
  $('toc').querySelectorAll('a').forEach(link => link.setAttribute('aria-current', String(link.hash.slice(1) === state.activeHeading || decodeURIComponent(link.hash.slice(1)) === state.activeHeading)));
  if (state.pendingResume && state.progress > .03) { state.pendingResume = null; $('resumeNotice').hidden = true; }
  clearTimeout(scrollTimer); scrollTimer = setTimeout(saveProgress, 400);
}
let scrollQueued = false;
window.addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(() => { scrollQueued = false; updateProgress(); }); } }, { passive: true });
window.addEventListener('pagehide', saveProgress);
window.addEventListener('resize', () => { if (innerWidth > 900) sidebar(false); else sidebar($('sidebar').classList.contains('open')); updateProgress(); });
$('topButton').addEventListener('click', () => { state.pendingResume = null; $('resumeNotice').hidden = true; scrollTo({ top: 0, behavior: 'smooth' }); });
$('dismissResume').addEventListener('click', () => { state.pendingResume = null; $('resumeNotice').hidden = true; saveProgress(); });
$('resumeButton').addEventListener('click', () => {
  const saved = state.pendingResume; if (!saved) return;
  state.pendingResume = null; $('resumeNotice').hidden = true;
  if (saved.heading && scrollHeading(saved.heading)) return;
  const top = $('content').getBoundingClientRect().top + scrollY;
  scrollTo({ top: top + saved.progress * Math.max(0, document.documentElement.scrollHeight - innerHeight - top), behavior: 'smooth' });
});

async function remoteDocument(value, signal) {
  const url = normalizeDocumentUrl(value);
  try {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]), credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (response.ok) return { text: await readBoundedText(response), sourceUrl: normalizeDocumentUrl(response.url || url), url };
    await response.body?.cancel();
  } catch (error) { if (signal.aborted) throw error; if (error instanceof DocumentError) throw error; }
  const response = await fetch(`/api/document?url=${encodeURIComponent(url)}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(14000)]) });
  let data;
  try { data = await response.json(); } catch { throw new DocumentError('本站代理暂不可用，请下载文档后打开。', 'network'); }
  if (!response.ok) throw new DocumentError(data.error || '读取失败，请稍后重试。', data.code || 'load_failed');
  return { text: data.markdown, sourceUrl: data.sourceUrl, url };
}
function addressFor(current, hash = '') {
  const address = new URL(location.origin + location.pathname);
  if (current.kind === 'url') address.searchParams.set('url', current.url);
  if (hash) address.hash = hash;
  return address;
}
async function load(input, { navigation = 'push', hash = '' } = {}) {
  saveProgress(); state.controller?.abort();
  const controller = new AbortController(); state.controller = controller; const loadId = ++state.loadId;
  state.loading = true; $('loadNotice').hidden = false; $('importError').hidden = true;
  try {
    let payload = { ...input };
    if (input.kind === 'url') payload = { ...payload, ...await remoteDocument(input.url, controller.signal) };
    if (input.file) {
      if (!/\.(md|markdown|txt)$/i.test(input.file.name)) throw new DocumentError('请选择 .md、.markdown 或 .txt 文本文件。', 'unsupported_type');
      if (input.file.size > MAX_DOCUMENT_BYTES) throw new DocumentError('文档超过 2 MB，请拆分后再打开。', 'too_large');
      payload.text = await input.file.text(); payload.filename = input.file.name;
    }
    if (controller.signal.aborted || loadId !== state.loadId) return;
    const rendered = await renderDocument(payload.text, { baseUrl: payload.sourceUrl });
    const id = await documentId(payload.text);
    if (controller.signal.aborted || loadId !== state.loadId) return;
    const title = rendered.title || payload.filename || (payload.url ? decodeURIComponent(new URL(payload.url).pathname.split('/').pop()) : '未命名文档') || '未命名文档';
    const saved = storage.find(id);
    state.current = { id, kind: payload.kind, url: payload.url || '', sourceUrl: payload.sourceUrl || '', title, text: payload.text };
    state.headings = rendered.headings; state.anchors = rendered.anchors; state.pendingResume = saved?.progress > .03 && !hash ? saved : null;
    state.progress = 0; state.maxProgress = 0; state.seconds = 0; state.engaged = false;
    $('content').querySelectorAll('img[data-diagram-image]').forEach(image => URL.revokeObjectURL(image.src));
    $('content').replaceChildren(rendered.fragment); buildToc(rendered.headings);
    $('home').hidden = true; $('reader').hidden = false; document.body.classList.add('is-reading');
    $('documentName').textContent = title; $('documentName').title = title;
    const sourceName = { url: '链接文档', file: '本地文件', paste: '粘贴文本', sample: '示例文档' }[payload.kind];
    $('documentMeta').textContent = `${sourceName} · ${rendered.count.toLocaleString()} 字词 · 约 ${rendered.minutes} 分钟`;
    document.title = `${title.slice(0, 100)} · Markdown Reader`;
    $('shareButton').hidden = payload.kind !== 'url'; $('resumeNotice').hidden = !state.pendingResume;
    if (state.pendingResume) $('resumeText').textContent = `上次读到 ${Math.round(saved.progress * 100)}%，从这里接着读。`;
    if ($('openDialog').open) $('openDialog').close();
    if ($('sourceDialog').open) $('sourceDialog').close();
    sidebar(false); scrollTo({ top: 0, behavior: 'instant' });
    if (navigation !== 'none') history[navigation === 'replace' ? 'replaceState' : 'pushState'](null, '', addressFor(state.current, hash));
    if (payload.kind !== 'sample') { checkStorage(storage.save({ ...state.current, progress: saved?.progress || 0, heading: saved?.heading || '' })); analytics.track('read_success', { source: payload.kind }); }
    renderRecent();
    state.loading = false; updateProgress();
    if (hash) { let target; try { target = decodeURIComponent(hash.replace(/^#/, '')); } catch { target = ''; } scrollHeading(target, false); }
    $('main').focus({ preventScroll: true });
    enhanceDiagrams($('content'), resolvedTheme(), controller.signal).then(() => { if (loadId === state.loadId) updateProgress(); }).catch(() => toast('图表组件暂时未能加载，已保留源码。'));
  } catch (error) {
    if (controller.signal.aborted || loadId !== state.loadId) return;
    const message = error.name === 'TimeoutError' ? '读取超时，请稍后重试或下载后打开。' : error instanceof DocumentError ? error.message : '暂时无法打开文档，请重试或换一种打开方式。';
    $('importError').textContent = message; $('importError').hidden = false; toast(message);
    if (input.kind !== 'sample') analytics.track('read_failure', { source: input.kind, reason: error.code || (error.name === 'TimeoutError' ? 'timeout' : 'load_failed') });
  } finally { if (loadId === state.loadId) { state.loading = false; $('loadNotice').hidden = true; } }
}
$('cancelLoad').addEventListener('click', () => { state.controller?.abort(); state.loadId++; state.loading = false; $('loadNotice').hidden = true; toast('已取消打开文档。'); });
$('renderButton').addEventListener('click', () => load({ kind: 'paste', text: $('pasteInput').value }));
$('urlForm').addEventListener('submit', event => { event.preventDefault(); load({ kind: 'url', url: $('urlInput').value.trim() }); });
$('sampleButton').addEventListener('click', () => load({ kind: 'sample', text: SAMPLE }));
$('dropZone').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', event => { const file = event.target.files[0]; if (file) load({ kind: 'file', file }); event.target.value = ''; });
$('dropZone').addEventListener('dragover', event => { event.preventDefault(); $('dropZone').classList.add('dragging'); });
$('dropZone').addEventListener('dragleave', () => $('dropZone').classList.remove('dragging'));
$('dropZone').addEventListener('drop', event => { event.preventDefault(); $('dropZone').classList.remove('dragging'); const file = event.dataTransfer.files[0]; if (file) load({ kind: 'file', file }); });
window.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
window.addEventListener('drop', event => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); if (event.target.closest?.('#dropZone')) return; const file = event.dataTransfer.files[0]; if (file) load({ kind: 'file', file }); } });
$('sourceButton').addEventListener('click', () => { if (state.current) { $('sourceInput').value = state.current.text; $('sourceDialog').showModal(); } });
$('applySource').addEventListener('click', () => load({ kind: 'paste', text: $('sourceInput').value }));
async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { toast('无法访问剪贴板，请在原文中手动选择复制。'); return false; } }
$('content').addEventListener('click', async event => {
  const button = event.target.closest('.copy-code');
  if (button) { const text = button.closest('.code-frame').querySelector('pre code').textContent; if (await copy(text)) { button.textContent = '已复制'; setTimeout(() => { if (button.isConnected) button.textContent = '复制'; }, 1800); track('copy_code'); } return; }
  const link = event.target.closest('a[href]');
  if (link?.getAttribute('href').startsWith('#')) { event.preventDefault(); let hash; try { hash = decodeURIComponent(link.getAttribute('href').slice(1)); } catch { return; } if (!scrollHeading(hash)) toast('文档中没有找到这个章节。'); }
});
$('shareButton').addEventListener('click', async () => {
  if (state.current?.kind !== 'url') return;
  if (new URL(state.current.url).search) { toast('链接含查询参数，请确认没有私密信息后，从地址栏手动复制。'); return; }
  const address = addressFor(state.current, state.activeHeading);
  if (await copy(address.href)) { toast('阅读链接已复制，包含当前章节。'); track('share_link'); }
});
$('printButton').addEventListener('click', () => { track('print_document'); window.print(); });
function showHome(navigate = true) {
  saveProgress(); state.controller?.abort(); state.loadId++; state.loading = false; state.current = null;
  $('loadNotice').hidden = true; $('home').hidden = false; $('reader').hidden = true;
  document.body.classList.remove('is-reading', 'focus-mode'); $('focusButton').textContent = '专注'; $('focusButton').setAttribute('aria-pressed', 'false');
  $('readingProgress').style.width = '0'; document.title = 'Markdown Reader · 专注每一页'; sidebar(false); renderRecent();
  if (navigate) history.pushState(null, '', location.pathname);
  scrollTo({ top: 0, behavior: 'instant' });
}
$('homeButton').addEventListener('click', () => showHome());
window.addEventListener('popstate', () => {
  const url = new URLSearchParams(location.search).get('url');
  if (url) { $('urlInput').value = url; load({ kind: 'url', url }, { navigation: 'none', hash: location.hash }); }
  else showHome(false);
});
window.addEventListener('hashchange', () => { if (state.current && location.hash) { try { scrollHeading(decodeURIComponent(location.hash.slice(1)), false); } catch { /* Malformed hash. */ } } });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && ['k', 'o'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.key.toLowerCase() === 'o') $('fileInput').click(); else openDocument('url');
  }
  if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { sidebar(false); if (document.body.classList.contains('focus-mode')) $('focusButton').click(); }
});
setInterval(() => {
  if (!state.current || state.current.kind === 'sample' || state.loading || document.visibilityState !== 'visible' || state.engaged) return;
  state.seconds++;
  if (state.seconds >= 30 && state.maxProgress >= .25) { state.engaged = true; track('read_engaged'); }
}, 1000);
analytics.ready.then(config => {
  if (config.analyticsEnabled) $('analyticsNotice').textContent = '此部署启用了匿名访问统计：记录页面浏览、来源域名、打开成功或失败、阅读参与和回访；不发送文档正文、标题、文件名或原始链接。尊重浏览器的 DNT 和 GPC 隐私信号。';
  if (config.feedbackUrl) { $('feedbackLink').href = config.feedbackUrl; $('feedbackLink').hidden = false; }
});
renderRecent();
const params = new URLSearchParams(location.search);
if (params.has('fullscreen')) { document.body.classList.add('focus-mode'); $('focusButton').textContent = '退出专注'; $('focusButton').setAttribute('aria-pressed', 'true'); }
if (params.get('url')) { $('urlInput').value = params.get('url'); load({ kind: 'url', url: params.get('url') }, { navigation: 'replace', hash: location.hash }); }
