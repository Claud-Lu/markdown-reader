import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';

// Optional operator-specific patterns stay outside source control.
const privateFile = process.env.RELEASE_PRIVATE_PATTERNS_FILE || '.release-private-patterns';
const privatePatterns = existsSync(privateFile) ? readFileSync(privateFile, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')) : [];
const generic = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z\d_]{25,}\b/,
  /\/(?:Users|home)\/[A-Za-z\d._-]+\/(?:Desktop|Documents|\.ssh|\.config)\//,
  /https?:\/\/[^\s/:]+:[^\s/@]+@/,
];
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]); }
if (!existsSync('dist/index.html')) throw new Error('Build the production assets before checking a release.');
const issues = [];
for (const file of [...new Set([...files, ...walk('dist')])]) {
  if (/^(?:wrangler\.toml|\.env(?:\..+)?|\.dev\.vars(?:\..+)?|\.release-private-patterns)$/.test(file) || file.startsWith('private/')) { issues.push(`${file}: deployment-only file in release inputs`); continue; }
  if (!['.js', '.css', '.html', '.md', '.json', '.toml', '.yml', '.svg'].includes(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  if (generic.some(pattern => pattern.test(text))) issues.push(`${file}: potential credential or local private path`);
  if (privatePatterns.some(pattern => text.toLowerCase().includes(pattern.toLowerCase()))) issues.push(`${file}: operator-specific content`);
}
const html = readFileSync('dist/index.html', 'utf8');
if (/<script\b[^>]*src=["']https?:/i.test(html)) issues.push('dist/index.html: external script hardcoded into the default build');
if (issues.length) { for (const issue of issues) console.error(issue); process.exitCode = 1; }
else console.log(`Release privacy check passed (${files.length} source files and production assets).`);
