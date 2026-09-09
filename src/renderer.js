import { Marked } from 'marked';
import createDOMPurify from 'dompurify';
import GithubSlugger from 'github-slugger';
import hljs from 'highlight.js/lib/common';
import { assertDocument, normalizeDocumentUrl } from './document.js';

export function createRenderer(window) {
  const purifier = createDOMPurify(window);
  const document = window.document;
  return async function renderDocument(text, { baseUrl = '' } = {}) {
    assertDocument(text);
    const marked = new Marked({ gfm: true, breaks: false });
    if (/\$[^\n]+\$|^\s*\$\$/m.test(text)) {
      const { default: mathExtension } = await import('marked-katex-extension');
      marked.use(mathExtension({ throwOnError: false, trust: false, output: 'mathml', maxExpand: 1000, maxSize: 10 }));
    }
    const fragment = purifier.sanitize(marked.parse(text), {
      RETURN_DOM_FRAGMENT: true, SANITIZE_NAMED_PROPS: true,
      FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed'],
      FORBID_ATTR: ['style', 'srcset', 'autofocus'],
      ADD_FORBID_CONTENTS: ['annotation'],
    });
    const slugger = new GithubSlugger(); const anchors = new Map(); const headings = [];
    for (const heading of fragment.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      const explicitId = heading.id.replace(/^user-content-/, '');
      const label = heading.textContent.trim();
      const slug = slugger.slug(label) || `heading-${headings.length + 1}`;
      heading.id = `section-${slug}`;
      if (explicitId && !anchors.has(explicitId)) anchors.set(explicitId, heading.id);
      if (!anchors.has(slug)) anchors.set(slug, heading.id);
      anchors.set(heading.id, heading.id);
      headings.push({ id: heading.id, text: label || '未命名章节', level: Number(heading.tagName[1]) });
    }
    // Resolve links against the final document URL, never the reader's own URL.
    for (const link of fragment.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) {
        let id; try { id = decodeURIComponent(href.slice(1)); } catch { id = href.slice(1); }
        const target = anchors.get(id);
        if (target) link.setAttribute('href', `#${target}`);
        continue;
      }
      if (/^mailto:/i.test(href)) { link.setAttribute('rel', 'noreferrer'); continue; }
      try {
        const resolved = new URL(href, baseUrl || undefined);
        normalizeDocumentUrl(resolved.href);
        link.href = resolved.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.referrerPolicy = 'no-referrer';
      } catch { link.removeAttribute('href'); link.title = '此相对链接需要原文地址才能打开'; }
    }
    for (const image of fragment.querySelectorAll('img')) {
      const src = image.getAttribute('src') || '';
      try {
        if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) image.src = normalizeDocumentUrl(src, baseUrl || undefined);
        image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
      } catch {
        const note = document.createElement('span'); note.className = 'image-placeholder';
        note.textContent = `${image.alt || '图片'} · 需要可访问的图片地址`; image.replaceWith(note);
      }
    }
    for (const code of fragment.querySelectorAll('pre > code')) {
      const language = /language-([^\s]+)/.exec(code.className)?.[1] || '';
      const pre = code.parentElement;
      const frame = document.createElement('div'); frame.className = 'code-frame';
      const bar = document.createElement('div'); bar.className = 'code-bar';
      const label = document.createElement('span'); label.textContent = language || 'text';
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'copy-code'; copy.textContent = '复制'; copy.setAttribute('aria-label', '复制代码');
      bar.append(label, copy); pre.replaceWith(frame); frame.append(bar, pre);
      if (language === 'mermaid') { frame.classList.add('diagram-frame'); code.dataset.diagram = 'pending'; }
      else if (hljs.getLanguage(language)) { hljs.highlightElement(code); }
    }
    const firstHeading = fragment.querySelector('h1');
    const plainText = fragment.textContent || '';
    const count = (plainText.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu) || []).length;
    return { fragment, headings, anchors, title: firstHeading?.textContent.trim() || '', count, minutes: Math.max(1, Math.ceil(count / 400)) };
  };
}

let diagramLibrary;
let diagramQueue = Promise.resolve();
export function enhanceDiagrams(root, theme, signal) {
  const task = diagramQueue.catch(() => {}).then(() => renderDiagrams(root, theme, signal));
  diagramQueue = task;
  return task;
}
async function renderDiagrams(root, theme, signal) {
  if (signal?.aborted) return;
  const nodes = [...root.querySelectorAll('code[data-diagram="pending"]')];
  if (!nodes.length) return;
  const { default: mermaid } = await (diagramLibrary ||= import('mermaid'));
  if (signal?.aborted) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: theme === 'dark' ? 'dark' : 'neutral', maxTextSize: 50_000, htmlLabels: false, fontFamily: 'system-ui, sans-serif', secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'htmlLabels', 'themeCSS', 'themeVariables', 'fontFamily', 'dompurifyConfig'] });
  const purifier = createDOMPurify(root.ownerDocument.defaultView);
  for (const code of nodes) {
    if (signal?.aborted || !code.isConnected) break;
    code.dataset.diagram = 'processed';
    const frame = code.closest('.code-frame');
    try {
      // Diagram-level configuration is not trusted to change the reader's policy.
      const source = code.textContent.replace(/%%\{[\s\S]*?\}%%/g, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
      if (source.length > 50_000) throw new Error('Diagram too large');
      const { svg } = await mermaid.render(`diagram-${crypto.randomUUID().replaceAll('-', '')}`, source);
      if (signal?.aborted || !code.isConnected) break;
      const graphic = root.ownerDocument.createElement('div'); graphic.className = 'diagram-preview';
      const clean = purifier.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'a'] });
      const image = root.ownerDocument.createElement('img');
      image.src = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
      image.dataset.diagramImage = 'true'; image.alt = 'Mermaid 图表，完整源码可在下方展开';
      // An SVG image isolates diagram styles from the surrounding document.
      graphic.append(image);
      const details = root.ownerDocument.createElement('details');
      const summary = root.ownerDocument.createElement('summary'); summary.textContent = '查看图表源码';
      const pre = code.parentElement; details.append(summary, pre); frame.append(graphic, details);
    } catch {
      if (signal?.aborted) break;
      const note = root.ownerDocument.createElement('p'); note.className = 'diagram-note'; note.textContent = '此图表暂时无法绘制，已保留源码供阅读和复制。'; frame.append(note);
    }
  }
}
