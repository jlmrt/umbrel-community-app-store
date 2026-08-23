# Repository instructions

- Treat every tracked file as public app-store metadata.
- Describe current product behavior only; never include conversational provenance, private evaluation history, or explanations of where requirements originated.
- Keep examples generic unless a named integration is part of a shipped app.
- Every app directory and manifest ID must begin with `jlmrt-`.
- Before assigning an app port, audit the current `getumbrel/umbrel-apps` manifests; use an unused port between `1000` and `9999`.
- App packages must pull published container images and must not contain local `build:` directives.
- Run `npm run check` and review the complete staged diff before committing or pushing.
