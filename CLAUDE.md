# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Mojaloop SDK Scheme Adapter - a monorepo that provides an adapter interface between Mojaloop API compliant switches and DFSP backend platforms.
The project consists of multiple modules organized using Nx workspace.

## Quick Reference (Start Here)

| Task | Command | Prerequisites |
|------|---------|---------------|
| Run all tests | `yarn test` | - |
| Run integration tests | `yarn test:integration` | Docker running, `yarn wait-4-docker` |
| Run specific module test | `yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run test:unit` | - |
| Build everything | `yarn build` | Node 22.15.1 (`nvm use`) |
| Start services | `yarn start` | Docker running, modules built |
| Update OpenAPI | `yarn build:openapi && yarn validate:api` | - |
| Debug main service | `yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run start:debug` | Port 9229 available |


**Critical File Locations:**
- Main server class: `modules/api-svc/src/SdkServer.js`
- Entry point: `modules/api-svc/src/index.js`
- Models: `modules/api-svc/src/lib/model/`
- Handlers: `modules/api-svc/src/{Inbound,Outbound}Server/handlers.js`
- Config: `modules/*/src/config/default.json`
- OpenAPI templates: `modules/*/src/*_template.yaml` (edit these, not `api.yaml`)

## Architecture
This service can be referenced as `Mojaloop Connector`, `ML Connector` or `Scheme Adapter`.

### Core Modules

- **api-svc**: Main service module (JavaScript/Node.js) handling inbound/outbound HTTP APIs and core business logic
- **outbound-command-event-handler**: TypeScript module handling outbound command events using domain-driven design
- **outbound-domain-event-handler**: TypeScript module processing domain events for outbound operations
- **private-shared-lib**: Shared TypeScript library containing domain entities, events, and infrastructure code

### Key Components

- **Event-Driven Architecture**: Uses Kafka for event streaming between modules
- **State Machines**: JavaScript State Machine library for managing transfer states
- **Cache Layer**: Redis for distributed caching and session management
- **Models**: Domain models for transfers, quotes, parties, bulk operations
- **Event Handlers**: FSPIOP and Backend event handling for Mojaloop protocol compliance
- **ControlAgent**: WebSocket client for PM4ML Management API with optional failsafe polling

## Code Structure Patterns

### API Service (modules/api-svc)
- **Handlers**: Route handlers in `src/InboundServer/handlers.js` and `src/OutboundServer/handlers.js`
- **Models**: Business logic in `src/lib/model/` with models like:
  - `TransfersModel.js` - Transfer operations
  - `QuotesModel.js` - Quote handling
  - `AccountsModel.js` - Account management
  - `InboundTransfersModel.js` - Inbound transfer processing
  - `OutboundTransfersModel.js` - Outbound transfer processing
  - `OutboundBulkQuotesModel.js` - Bulk quote operations
  - `OutboundBulkTransfersModel.js` - Bulk transfer operations
- **State Machines**: Use `PersistentStateMachine` for managing complex state transitions
- **Middleware**: Validation and error handling middleware in `middlewares.js`
- **OpenAPI Templates**: API definitions in `api_template.yaml` files, compiled to `api.yaml`

### Event Handlers (TypeScript modules)
- **Domain Layer**: Aggregates and entities in `src/domain/`
- **Application Layer**: Event handlers in `src/application/handlers/`
- **Infrastructure**: Kafka producers/consumers in shared lib
- **API Server**: Express-based APIs with OpenAPI specs
- **Build Process**: TypeScript compilation + file copying (YAML files)

### Testing Patterns
- **Unit tests**: `test/unit/` directories using Jest
- **Integration tests**: `test/integration/` requiring Docker services
- **Functional tests**: Separate test suites in `test/func_bulk/` and `test/func_iso20022/`
- **Mocks**: Test mocks in `test/__mocks__/`
- **Setup**: Test setup files like `test/unit/setup.js`
- **Configuration**: Jest config in individual `jest.config.js` files

## Development Commands
Check **[development-commands.md](./_cc/docs/development-commands.md)** file to get details about some useful commands to
build and setup the project, start the services, run tests, linting, deps and audit checks, etc.

## Key Libraries & Dependencies

- **@mojaloop/sdk-standard-components**: Core Mojaloop SDK components
- **@mojaloop/central-services-***: Mojaloop platform services
- **@mojaloop/api-snippets**: API specification components
- **javascript-state-machine**: State management for transfers
- **redis**: Distributed caching (v5.x)
- **express/koa**: HTTP servers (Express for newer modules, Koa for some services)
- **ajv**: JSON schema validation
- **convict**: Configuration management in TypeScript modules
- **openapi-backend**: OpenAPI request validation and routing
- **Package Manager**: Yarn 4.10.2 (Berry)

## Docker Environment

See [development-commands.md](./_cc/docs/development-commands.md#docker-operations) for Docker commands.

**Services:** redis (6379), kafka (9092), ml-testing-toolkit (4040/5050), mojaloop-testing-toolkit-ui (6060)
**Debug profile adds:** redisinsight (9001), kafka-debug-ui (9080)
**Main service ports:** 4000-4004, 9229 (debugger)

## Development Patterns & Notes

### Module Architecture
- **api-svc**: JavaScript-based, legacy module with core functionality
- **Shared lib**: Private workspace package for cross-module code

### Event Sourcing
Commands → `outbound-command-event-handler` → Domain events → `outbound-domain-event-handler`
**Kafka topics:** `topic-sdk-outbound-command-events`, `topic-sdk-outbound-domain-events`

### State Management
**Redis:** State machine persistence, distributed cache, cross-module communication, bulk transaction tracking
**Pattern:** `PersistentStateMachine` class for complex state transitions

### OpenAPI Workflow
1. Edit `*_template.yaml` files (not generated `api.yaml`)
2. Run `yarn build:openapi` to compile templates
3. Validate with `yarn validate:api`
4. Uses `@redocly/openapi-cli` for bundling

### Testing Workflow
1. **Unit tests**: Run locally without dependencies
2. **Integration tests**: Require Docker services (Redis, Kafka)
3. **Functional tests**: Full end-to-end scenarios with TTK
4. Use `yarn wait-4-docker` to ensure services are ready

## Common Development Tasks

See [development-commands.md](./_cc/docs/development-commands.md) for all commands and [common-workflows.md](./_cc/docs/common-workflows.md) for step-by-step guides.

## For AI Assistants (Memory Management Hints)

**Always Re-read Before:**
- Modifying OpenAPI specs → Review OpenAPI Workflow section first
- Running integration tests → Verify Docker prerequisites and Testing Workflow
- Making state machine changes → Review api-svc-06-state-management.md
- Debugging test failures → Check development-commands.md for troubleshooting

**Cache (Low Change Frequency):**
- Architecture: 3 TypeScript modules (command-handler, domain-handler, shared-lib) + api-svc (JavaScript)
- Event flow: Command events → outbound-command-event-handler → Domain events → outbound-domain-event-handler
- Redis patterns: State machines, distributed cache, pub/sub, bulk transaction tracking
- Kafka topics: `topic-sdk-outbound-command-events`, `topic-sdk-outbound-domain-events`
- Package manager: Yarn 4.10.2 (Berry)
- Node version: 22.15.1

**Key Patterns to Remember:**
- Edit `*_template.yaml` files, NEVER edit generated `api.yaml` files
- State machines use `PersistentStateMachine` class backed by Redis
- Integration tests require Docker services - use `yarn wait-4-docker`
- Use workspace syntax: `yarn workspace @mojaloop/sdk-scheme-adapter-<module> run <command>`
- Nx caching enabled for builds/tests - use `--skip-nx-cache` to bypass

**When Uncertain:**
- Ask user ANY clarifying questions
- Check Quick Reference section at top of this file
- Consult api-svc-01-overview.md for 30-minute onboarding
- Use development-commands.md for command reference
- See common-workflows.md for step-by-step task guides

## Documentation

### API-SVC Module Documentation

The api-svc module has comprehensive documentation in two locations:

#### 1. Standalone Module Documentation (AI-Optimized)

**Location**: `modules/api-svc/_cc/docs/`

Complete standalone documentation for the api-svc module, optimized for AI assistants and quick onboarding:

- **[modules/api-svc/CLAUDE.md](./modules/api-svc/CLAUDE.md)** - Module AI assistant guide (⭐ START HERE)
- **[00-index.md](./modules/api-svc/_cc/docs/00-index.md)** - Documentation navigation hub
- **[01-overview.md](./modules/api-svc/_cc/docs/01-overview.md)** - ⭐ MANDATORY 3-page overview (complete mental model)
- **[02-quickstart.md](./modules/api-svc/_cc/docs/02-quickstart.md)** - 5-minute setup guide
- **[03-architecture.md](./modules/api-svc/_cc/docs/03-architecture.md)** - Technical architecture deep dive
- **[04-api-reference.md](./modules/api-svc/_cc/docs/04-api-reference.md)** - API endpoints & schemas
- **[05-key-flows-use-cases.md](./modules/api-svc/_cc/docs/05-key-flows-use-cases.md)** - Business flows (outbound/inbound transfers)
- **[06-configuration.md](./modules/api-svc/_cc/docs/06-configuration.md)** - All environment variables
- **[07-dependencies.md](./modules/api-svc/_cc/docs/07-dependencies.md)** - NPM packages & external services
- **[08-testing.md](./modules/api-svc/_cc/docs/08-testing.md)** - Testing strategy & examples
- **[09-deployment.md](./modules/api-svc/_cc/docs/09-deployment.md)** - Production deployment guide
- **[10-development.md](./modules/api-svc/_cc/docs/10-development.md)** - Development workflow
- **[11-troubleshooting.md](./modules/api-svc/_cc/docs/11-troubleshooting.md)** - Common issues & solutions
- **[12-ai-guide.md](./modules/api-svc/_cc/docs/12-ai-guide.md)** - AI assistant quick reference
- **[13-glossary.md](./modules/api-svc/_cc/docs/13-glossary.md)** - Domain terminology & acronyms
- **[14-changelog.md](./modules/api-svc/_cc/docs/14-changelog.md)** - Recent changes

**For AI Assistants**: Always start with **[modules/api-svc/CLAUDE.md](./modules/api-svc/CLAUDE.md)**, then read **[01-overview.md](./modules/api-svc/_cc/docs/01-overview.md)** (mandatory).

#### 2. Comprehensive Technical Documentation

**Location**: `_cc/docs/api-svc/`

In-depth technical documentation covering advanced topics:

| Document | Description |
|----------|-------------|
| **[api-svc-01-overview.md](./_cc/docs/api-svc/api-svc-01-overview.md)** | Extended overview, 30-minute onboarding with core concepts and transfer flows |
| **[api-svc-02-architecture.md](./_cc/docs/api-svc/api-svc-02-architecture.md)** | System architecture, component design, configuration system, startup sequence |
| **[api-svc-03-inbound-server.md](./_cc/docs/api-svc/api-svc-03-inbound-server.md)** | Inbound server handling async FSPIOP callbacks from Mojaloop switch |
| **[api-svc-04-outbound-server.md](./_cc/docs/api-svc/api-svc-04-outbound-server.md)** | Outbound server providing synchronous REST API for DFSP backends |
| **[api-svc-05-models.md](./_cc/docs/api-svc/api-svc-05-models.md)** | Business logic models orchestrating party lookups, quotes, transfers, bulk operations |
| **[api-svc-06-state-management.md](./_cc/docs/api-svc/api-svc-06-state-management.md)** | Redis-backed state machines, pub/sub patterns, key patterns, recovery behavior |
| **[api-svc-07-control-agent.md](./_cc/docs/api-svc/api-svc-07-control-agent.md)** | WebSocket client for PM4ML Management API dynamic configuration |
| **[api-svc-08-error-handling.md](./_cc/docs/api-svc/api-svc-08-error-handling.md)** | Error taxonomy, Mojaloop error codes, handling patterns, logging strategies |
| **[api-svc-09-core-dependencies.md](./_cc/docs/api-svc/api-svc-09-core-dependencies.md)** | Core dependencies including @mojaloop/sdk-standard-components, JWS, ILP, OIDC |
| **[api-svc-10-service-lifecycle.md](./_cc/docs/api-svc/api-svc-10-service-lifecycle.md)** | Service startup/shutdown sequences, component bootstrap order, configuration sources, hot reload |
| **[api-svc-11-event-handlers.md](./_cc/docs/api-svc/api-svc-11-event-handlers.md)** | Kafka event handlers for domain/command events integration with TypeScript modules |
| **[api-svc-12-testing.md](./_cc/docs/api-svc/api-svc-12-testing.md)** | Testing strategy covering unit, integration, and functional tests |
| **[api-svc-13-deployment.md](./_cc/docs/api-svc/api-svc-13-deployment.md)** | Kubernetes deployment with Helm charts, production configuration, monitoring |
| **[api-svc-14-examples.md](./_cc/docs/api-svc/api-svc-14-examples.md)** | Practical examples: outbound/inbound transfers, error handling, bulk operations, auto-accept |

### General Documentation

| Document | Description |
|----------|-------------|
| **[development-commands.md](./_cc/docs/development-commands.md)** | Complete command reference for building, testing, and running the project |
| **[common-workflows.md](./_cc/docs/common-workflows.md)** | Step-by-step guides for common development workflows |
