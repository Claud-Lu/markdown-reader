# Contributor instructions

Markdown Reader is a public, MIT-licensed project. Keep the open-source distribution independent of any operator's private deployment.

- Never commit credentials, private endpoints, local filesystem paths, personal information, visitor records, internal project data or screenshots containing real private content.
- Use generic examples and placeholder domains. Analytics and feedback integrations must be disabled by default and configured outside Git.
- Browser-visible configuration is public. Credentials must stay server-side.
- Keep `AGENTS.md` and `CLAUDE.md` identical.
- Preserve vanilla JavaScript and the existing Cloudflare Workers architecture unless a change requires otherwise.
- Develop on `dev`. Validate before committing and pushing. Do not merge into `main` or deploy production without release authorization.
- Run `npm run check` and verify meaningful reader flows in a browser, including a mobile layout. The release scan must cover both source and `dist`.
- Add meaningful tests for document safety, navigation, data handling and regressions. Update README and CHANGELOG when behavior changes.
- Deployment-only files (`wrangler.toml`, `.dev.vars`, `.env*`, `.release-private-patterns`) are ignored. Keep operator-specific notes outside this public repository.
