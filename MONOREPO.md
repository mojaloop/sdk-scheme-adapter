# Monorepo Info

This Monorepo is using [Nx](https://nx.dev/using-nx/nx-cli).

Reasons for this:

- It supports running sub-Module commands only for Modules that have changes by using the `nx affected` runner.

## VSCode

### Linting for Modules

Command Palette:

CMD + Shift + P
Start to type Workspace settings

Select --> `Preferences: Open Workspace Settings`

Search for `ESLint`, and look for `Working Directories`.

```yaml
  "eslint.workingDirectories": [
    "modules/api-svc",
    "modules/outbound-command-event-handler",
    "modules/outbound-domain-event-handler",
    "modules/private-shared-lib"
    ...
  ]
```

CMD + Shift + P -> `ESLint: Restart ESLint Server`.
