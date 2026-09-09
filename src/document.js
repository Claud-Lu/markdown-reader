export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export class DocumentError extends Error {
  constructor(message, code = 'invalid_document', status = 400) {
    super(message); this.name = 'DocumentError'; this.code = code; this.status = status;
  }
}
export function normalizeDocumentUrl(value, base) {
  let url;
  try { url = new URL(value, base); }
  catch { throw new DocumentError('请输入完整的 http 或 https 文档链接。', 'invalid_url'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new DocumentError('请使用不含账号密码的公开 http 或 https 链接。', 'invalid_url');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host)
      || (url.port && !['80', '443'].includes(url.port))) {
    throw new DocumentError('仅支持公开域名的文档链接。', 'invalid_url');
  }
  url.hostname = host; url.hash = '';
  if (host === 'github.com' && /^\/[^/]+\/[^/]+\/blob\//.test(url.pathname)) {
    url.hostname = 'raw.githubusercontent.com'; url.pathname = url.pathname.replace('/blob/', '/');
    if ([...url.searchParams.keys()].every(key => ['raw', 'plain'].includes(key))) url.search = '';
  }
  if (host === 'gitlab.com') url.pathname = url.pathname.replace('/-/blob/', '/-/raw/');
  if (host === 'gitee.com') url.pathname = url.pathname.replace('/blob/', '/raw/');
  return url.href;
}
export async function readBoundedText(response, limit = MAX_DOCUMENT_BYTES) {
  const type = response.headers.get('content-type') || '';
  if (/text\/html|application\/xhtml|image\/|audio\/|video\/|application\/pdf/i.test(type)) {
    await response.body?.cancel();
    throw new DocumentError('这个链接返回的不是文本文件。请使用 Markdown 原文链接，或下载文件后打开。', 'unsupported_type', 415);
  }
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel(); throw new DocumentError('文档超过 2 MB，请拆分后再打开。', 'too_large', 413);
  }
  if (!response.body) return '';
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let bytes = 0; let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new DocumentError('文档超过 2 MB，请拆分后再打开。', 'too_large', 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  if (/^\s*(?:<!doctype\s+html|<html[\s>])/i.test(text)) {
    throw new DocumentError('这个链接返回了网页，请改用文档的原文链接。', 'unsupported_type', 415);
  }
  if (text.includes('\0')) throw new DocumentError('这个文件不是可阅读的文本。', 'unsupported_type', 415);
  return text.replace(/^\uFEFF/, '');
}
export function assertDocument(text) {
  if (!text.trim()) throw new DocumentError('文档是空的，请选择其他文件或粘贴内容。', 'empty');
  if (new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES) throw new DocumentError('文档超过 2 MB，请拆分后再打开。', 'too_large', 413);
}
