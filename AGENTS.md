# Repository instructions

- Treat every tracked file as public app-store metadata.
- Describe current product behavior only; never include conversational provenance, private evaluation history, or explanations of where requirements originated.
- Keep examples generic unless a named integration is part of a shipped app.
- Every app directory and manifest ID must begin with `jlmrt-`.
- App packages must pull published container images and must not contain local `build:` directives.
- Run `npm run check` and review the complete staged diff before committing or pushing.
