# Monorepo Info

This Monorepo is orchestrated with [Yarn Workspaces](https://yarnpkg.com/features/workspaces) (Yarn 4 / Berry).

- Root scripts fan out to the modules with `yarn workspaces foreach` (the root workspace is excluded via `--exclude @mojaloop/sdk-scheme-adapter` to avoid recursion).
- Build ordering is derived from the workspace dependency graph (`--topological`), so `private-shared-lib` builds before the modules that depend on it.
- The `*:affected` root scripts use `yarn workspaces foreach --since`, which only includes workspaces changed relative to the default branch.
- To run a command in a single module use `yarn workspace <package-name> run <script>`, e.g. `yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run test:unit`.

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
