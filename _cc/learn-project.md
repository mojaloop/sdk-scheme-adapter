You are a senior backend engineer mentoring interns/junior JS developers. Your task is to study this repository
(it also cn be found by link: https://github.com/mojaloop/sdk-scheme-adapter)

Target branch: `main`; if multiple active branches or major forks exist, compare and note differences)

## Mission
1) Understand and explain Business Logic and Architecture.
2) Produce accurate, implementation-level notes (no hand-waving).
3) Save all findings as Markdown files in `./_cc/docs` folder suitable for onboarding juniors.
4) Prefer concise, example-driven explanations with TypeScript/JavaScript snippets and Mermaid diagrams.
5) Link all new files in `CLAUDE.md` with really brief explanation what each file is about.

## Critical Focus Areas (business logic, architecture, and main implementation details)
- Inbound server (FSPIOP / ISO 20022 formats)
- Outbound server (Mojaloop SDK Outbound Scheme Adapter API)
- Request state management (Redis usage, keys, TTLs, state-machine/lifecycle)
- ControlAgent (WebSocket agent) integration with PM4ML management API:
  https://github.com/pm4ml/mojaloop-payment-manager-management-api
- Mojaloop SDK Backend API (interactions with core connectors and DFSP backend systems)

## Deliverables (Markdown in ./_cc/docs)
Create separate files (add more if helpful):
- High-level overview + quickstart. Who uses this service, how it fits Mojaloop hub DFSP workflows.
- System context, containers/components, runtime topology, configs/env. Include:
    - Sequence diagrams (PlantUML) for key flows (e.g., Payer DFSP -> Inbound -> Backend -> Outbound -> Switch -> callback).
- Inbound Server: Purpose, routes, request/response schemas, auth/security, validation, error handling, retry/backoff, logging/tracing.
- Outbound Server: Outbound API surface, happy-path + failure flows, idempotency, correlation IDs, callback handling.
- Request State Management (using Redis):
    - Keys, value shapes, expirations, pub/sub usage (if any), transactionality.
    - State machine diagram (Mermaid) for request lifecycle (init → pending → fulfilled/errored/cancelled).
    - Recovery logic on restarts, exactly-once/at-least-once semantics, race-condition mitigations.
- ControlAgent design:
    - WebSocket lifecycle, message formats, heartbeats, reconnection, auth.
    - Interface with PM4ML management API (endpoints used, commands, examples) - https://github.com/pm4ml/mojaloop-payment-manager-management-api
- Backend API: Mojaloop SDK Backend API spec relevant here:
    - Endpoints, payload shapes, correlation rules, error codes.
    - Mapping between inbound/outbound and backend calls (table).
- Error handling patterns: Error taxonomy, standardized problem codes, logs, metrics, traces.
- Glossary — Mojaloop terms, DFSP, transfer, quote, callback, ILP, FSPIOP, etc., with links to code.

## Analysis Instructions
- Read source code, package.json scripts, config files, OpenAPI/Swagger specs, and README(s).
- Infer actual behavior from code over docs when they disagree; call out discrepancies.
- Capture all external dependencies (libraries, services, ports).
- Map end-to-end flows for: party lookup, quote, transfer, and callback handling.
- Document correlation and idempotency strategies (HTTP headers, FSPIOP signatures/urls, state keys).
- Note security: TLS, signing, auth between components, any PII handling, and compliance concerns.
- For Redis, provide concrete key examples and short JS code snippets showing set/get patterns used here.
- For each HTTP/WebSocket route: method, path, request schema, response schema, main side effects, and error paths.
- Include small, runnable TS/JS examples that mimic real requests (curl + axios snippets).

## Writing Style
- Audience: junior JS devs. Prioritize clarity and accuracy; keep sections short with examples.
- Use TypeScript types where feasible. Avoid framework-agnostic pseudocode when real code exists.
- Provide “Why it’s designed this way” notes and trade-offs.
- Link to source files by path (e.g., `src/handlers/inbound/…`).
- Avoid speculation; if unknown, create a TODO in a “Gaps & Open Questions” section.

## Output Rules
- DO NOT execute the code; perform static analysis only.
- Produce all files in `./_cc/docs`.
- Use GitHub-flavored Markdown; keep line length reasonable.
- Include a short “Onboarding in 30 minutes” section.
- Update `CLAUDE.md` with links to new files.

## Validation Checklist (include at end of each file)
- [ ] Routes and payloads verified against code
- [ ] Error paths documented
- [ ] Examples compile in TS
- [ ] Links/paths correct

Begin now. If repo structure suggests different file splits, propose and proceed. 

If you have any questions or hesitations, please ask immediately.
