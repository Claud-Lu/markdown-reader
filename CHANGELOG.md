# Changelog

## 2.0.0 — 2026-09-09

- Introduce a reading-focused, responsive interface with sample content, source editing and accessible import/navigation controls.
- Fix code highlighting, unsafe title/history HTML insertion, stale sharing URLs and broken original heading links.
- Add all heading levels, relative source assets, GitHub/GitLab/Gitee URL normalization, copyable code, lazy Mermaid diagrams and mathematical formulas.
- Add complete light/dark/system themes, typography controls, focus mode, chapter/progress resume and clean print styles.
- Preserve existing v1 URL history; keep local document bodies ephemeral and omit signed/query-bearing URLs from records and automatic sharing.
- Remove deployment-specific hardcoding. Make analytics and feedback optional and disabled by default; add a minimized, same-origin event relay and a public privacy notice.
- Bundle rendering dependencies locally, limit and validate proxy requests, and add functional/security tests and release privacy checks.
- Use generic configuration templates and validated, explicit production deployment instead of an unchecked push-to-deploy workflow.
