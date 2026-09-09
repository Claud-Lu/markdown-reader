import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRenderer } from '../src/renderer.js';
import { createStorage } from '../src/storage.js';
import { normalizeDocumentUrl, readBoundedText } from '../src/document.js';
const render = createRenderer(new JSDOM('', { url: 'https://reader.example.com/' }).window);
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

test('all heading levels, duplicate Chinese headings and original fragment links resolve', async () => {
  const result = await render('# 文档\n## 章节\n## 章节\n### 细节\n#### 四\n##### 五\n###### 六\n[原链接](#章节-1)');
  assert.deepEqual(result.headings.map(item => item.level), [1, 2, 2, 3, 4, 5, 6]);
  assert.equal(result.fragment.querySelector('a').getAttribute('href'), '#section-章节-1');
  assert.equal(result.anchors.get('章节-1'), 'section-章节-1');
});
test('HTML-looking heading text remains inert and active HTML is removed', async () => {
  const result = await render('# `<img src=x onerror=alert(1)>`\n## `<svg onload=alert(1)>`\n<img src="https://example.com/a.png" onerror="alert(1)">\n<script>alert(1)</script><iframe src="https://example.com"></iframe><div style="position:fixed">文字</div>\n\n[危险](javascript:alert%281%29)');
  assert.match(result.title, /<img/);
  assert.equal(result.fragment.querySelectorAll('script,iframe,[onerror],[onload],[style]').length, 0);
  assert.equal(result.fragment.querySelector('a').hasAttribute('href'), false);
  assert.equal(result.fragment.querySelectorAll('img').length, 1);
});
test('relative image and document links use the source directory', async () => {
  const result = await render('![说明](images/a.png)\n[下一页](guide.md#part)', { baseUrl: 'https://docs.example.com/project/README.md' });
  assert.equal(result.fragment.querySelector('img').src, 'https://docs.example.com/project/images/a.png');
  assert.equal(result.fragment.querySelector('img').referrerPolicy, 'no-referrer');
  assert.equal(result.fragment.querySelector('a').href, 'https://docs.example.com/project/guide.md#part');
  assert.equal(result.fragment.querySelector('a').rel, 'noopener noreferrer');
});
test('local relative images and private-network images are replaced with an explanation', async () => {
  const result = await render('![本地](images/a.png)\n![私有](http://127.0.0.1/a.png)');
  assert.equal(result.fragment.querySelectorAll('img').length, 0);
  assert.equal(result.fragment.querySelectorAll('.image-placeholder').length, 2);
});
test('known code languages are highlighted, while Mermaid source remains available', async () => {
  const result = await render('```javascript\nconst value = "hello";\n```\n```mermaid\ngraph TD\n A --> B\n```');
  assert.ok(result.fragment.querySelector('code.language-javascript .hljs-keyword'));
  assert.equal(result.fragment.querySelectorAll('.copy-code').length, 2);
  assert.equal(result.fragment.querySelector('code[data-diagram]').textContent, 'graph TD\n A --> B\n');
});
test('math produces native MathML without executable markup', async () => {
  const result = await render('行内 $E=mc^2$\n\n$$\n\\frac{1}{2}\n$$');
  assert.equal(result.fragment.querySelectorAll('math').length, 2);
  assert.doesNotMatch(result.fragment.querySelector('math').textContent, /E=mc\^2/);
  assert.equal(result.fragment.querySelectorAll('script,[style]').length, 0);
});
test('empty documents are rejected without replacing the current document', async () => {
  await assert.rejects(render('  '), error => error.code === 'empty');
});
test('GitHub file pages normalize and credentials or local addresses are rejected', () => {
  assert.equal(normalizeDocumentUrl('https://github.com/example/docs/blob/main/README.md?raw=1'), 'https://raw.githubusercontent.com/example/docs/main/README.md');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://127.1/a', 'http://0x7f000001/a', 'http://[::1]/a', 'http://localhost/a', ['https://', 'x:y', '@example.com/a'].join(''), 'https://example.com:8443/a']) assert.throws(() => normalizeDocumentUrl(url));
});
test('bounded reader rejects oversized streams and HTML disguised as text', async () => {
  await assert.rejects(readBoundedText(new Response('123456789'), 8), error => error.code === 'too_large');
  await assert.rejects(readBoundedText(new Response('<!doctype html><html>blocked</html>', { headers: { 'content-type': 'text/plain' } })), error => error.code === 'unsupported_type');
});
test('records never persist document text or signed URLs, and disabling recording clears history', () => {
  const raw = memory(); const store = createStorage(raw);
  store.save({ id: 'a'.repeat(64), title: '标题', kind: 'url', url: 'https://example.com/a.md?token=not-a-real-token', text: 'PRIVATE DOCUMENT BODY', progress: .4 });
  assert.equal(store.records()[0].url, '');
  assert.equal(raw.getItem('markdown-reader-v2').includes('PRIVATE DOCUMENT BODY'), false);
  assert.equal(raw.getItem('markdown-reader-v2').includes('not-a-real-token'), false);
  store.settingsUpdate({ remember: false }); assert.equal(store.records().length, 0);
  store.save({ id: 'b'.repeat(64), title: '不要记录', kind: 'paste' }); assert.equal(store.records().length, 0);
});
test('existing v1 URL history is preserved and replaced without duplicates on reopening', () => {
  const raw = memory(); raw.setItem('md-reader-history', JSON.stringify([{ title: '旧文档', url: 'https://example.com/a.md', time: 1 }]));
  const store = createStorage(raw); assert.equal(store.records()[0].title, '旧文档');
  store.save({ id: 'a'.repeat(64), title: '新标题', kind: 'url', url: 'https://example.com/a.md' });
  assert.equal(store.records().length, 1); assert.equal(store.records()[0].title, '新标题');
});
test('unavailable or corrupted browser storage never prevents reading', () => {
  const store = createStorage({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.equal(store.settings().fontSize, 18);
  assert.equal(store.save({ id: 'a'.repeat(64), title: '本地', kind: 'file' }), false);
  const raw = memory(); raw.setItem('markdown-reader-v2', '{broken'); assert.deepEqual(createStorage(raw).records(), []);
});
