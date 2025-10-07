# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Mojaloop SDK Scheme Adapter - a monorepo that provides an adapter interface between Mojaloop API compliant switches and DFSP backend platforms.
The project consists of multiple modules organized using Nx workspace.

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

## Development Commands

### Build & Setup
```bash
yarn install             # Install dependencies
yarn build               # Build all modules
yarn build:affected      # Build only changed modules
yarn build:no-cache      # Build all without using cache
nvm use                  # Use correct Node version (22.15.1)
```

### Running Services
```bash
yarn start                    # Start all modules in parallel
yarn start:api-svc           # Start API service only
yarn start:event-handler     # Start domain event handler
yarn start:command-handler   # Start command event handler
```

### Individual Module Commands
Run module-specific commands using workspace syntax:
```bash
yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run <command>
yarn workspace @mojaloop/sdk-scheme-adapter-outbound-command-event-handler run <command>
yarn workspace @mojaloop/sdk-scheme-adapter-outbound-domain-event-handler run <command>
```

### Testing
```bash
yarn test                   # Run unit tests
yarn test:unit              # Run unit tests for all modules
yarn test:unit:no-cache     # Run unit tests without cache
yarn test:unit:affected     # Run unit tests only for affected modules
yarn test:integration       # Run integration tests (requires Docker)
yarn test:functional        # Run functional tests
yarn test:coverage          # Run tests with coverage
```

### Module-Specific Testing
```bash
# api-svc specific tests
yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run test:integration-pm4ml

# Integration tests for individual modules
yarn workspace @mojaloop/sdk-scheme-adapter-outbound-command-event-handler run test:integration

# Run specific test file (from modules/api-svc directory)
cd modules/api-svc && yarn jest --runInBand test/unit/index.configPolling.test.js --setupFilesAfterEnv=./test/unit/setup.js
```

### Linting
```bash
yarn lint                  # Lint all modules
yarn lint:affected         # Lint only affected modules
yarn lint:fix              # Fix linting issues
yarn lint:fix:affected     # Fix linting issues in affected modules
```

### Docker Operations
```bash
yarn docker:build          # Build Docker image (uses .nvmrc for Node version)
yarn docker:up            # Start with docker-compose
yarn docker:stop          # Stop containers
yarn docker:down          # Stop and remove containers
yarn docker:clean         # Remove containers and local images
```

### OpenAPI Management and Validation
```bash
yarn build:openapi              # Build OpenAPI specs
yarn build:openapi:inbound      # Build inbound API spec only
yarn validate:api               # Validate OpenAPI specifications
```

### Dependency Management
```bash
yarn dep:check            # Check for dependency updates
yarn dep:update           # Update dependencies
yarn audit:check          # Run security audit
yarn audit:fix            # Fix audit issues
```

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

## Key Libraries & Dependencies

- **@mojaloop/sdk-standard-components**: Core Mojaloop SDK components
- **@mojaloop/central-services-***: Mojaloop platform services
- **@mojaloop/api-snippets**: API specification components
- **javascript-state-machine**: State management for transfers
- **redis**: Distributed caching (v5.x)
- **express/koa**: HTTP servers (Express for newer modules, Koa for some services)
- **ajv**: JSON schema validation
- **kafkajs**: Event streaming (via platform libs)
- **convict**: Configuration management in TypeScript modules
- **openapi-backend**: OpenAPI request validation and routing

## Environment Setup

- **Node.js**: Version 22.15.1 (specified in `.nvmrc`)
- **Package Manager**: Yarn 4.10.2 (Berry)
- **Workspaces**: Modules in `modules/*` directory
- **Nx**: Monorepo task orchestration and caching
- **TypeScript**: v5.9.3 for TypeScript modules
- **ESLint**: v9.15.0 with module-specific configs

## Docker Environment

The project includes Docker Compose setup with the following services:
- **sdk-scheme-adapter-api-svc**: Main API service (ports 4000-4004, 9229 for debugging)
- **redis**: Cache service (port 6379)
- **kafka**: Event streaming (ports 9092, 29092)
- **ml-testing-toolkit**: Mojaloop testing toolkit (ports 4040, 5050)
- **mojaloop-testing-toolkit-ui**: UI for testing (port 6060)
- **redisinsight**: Redis UI (port 9001) - debug profile
- **kafka-debug-ui**: Kafka UI (port 9080) - debug profile

### Docker Profiles
```bash
docker-compose --profile debug up    # Start with debug tools (Redis/Kafka UI)
```

## Development Patterns & Notes

### Module Architecture
- **api-svc**: JavaScript-based, legacy module with core functionality
- **New modules**: TypeScript with domain-driven design patterns
- **Shared lib**: Private workspace package for cross-module code

### Event Sourcing
- Command events flow through `outbound-command-event-handler`
- Domain events processed by `outbound-domain-event-handler`
- Kafka topics: `topic-sdk-outbound-command-events`, `topic-sdk-outbound-domain-events`

### State Management
- Redis used for:
  - State machine persistence
  - Distributed caching
  - Cross-module communication
  - Bulk transaction state tracking

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

### Nx Cache
- Build and test operations are cached
- Use `--skip-nx-cache` to bypass cache
- Affected commands work from `master` branch baseline

## Common Development Tasks

### Running the Full Stack Locally
```bash
docker-compose up -d           # Start dependencies
nvm use                        # Switch to correct Node version
yarn install                   # Install dependencies
yarn build                     # Build all modules
export API_SERVER_ENABLED=true # Enable API server
yarn start                     # Start all services
```

### Debugging
```bash
yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run start:debug
# Connect debugger to port 9229
```

### Making API Changes
1. Update `*_template.yaml` in module
2. Run `yarn build:openapi`
3. Run `yarn validate:api`
4. Update handlers to match new spec

### Release Process
```bash
yarn release          # Create release (updates version, changelog)
yarn snapshot         # Create snapshot release for testing
```

## Documentation

### API-SVC Module Documentation

Comprehensive documentation for the api-svc module (core service handling inbound/outbound APIs):

1. **[api-svc-01-overview.md](_cc/docs/api-svc-01-overview.md)** - Overview & Quick Start guide with 30-minute onboarding
2. **[api-svc-02-architecture.md](_cc/docs/api-svc-02-architecture.md)** - Architecture, components, configuration system, and startup sequence
3. **[api-svc-03-inbound-server.md](_cc/docs/api-svc-03-inbound-server.md)** - Inbound server handling FSPIOP callbacks from Mojaloop switch
4. **[api-svc-04-outbound-server.md](_cc/docs/api-svc-04-outbound-server.md)** - Outbound server providing DFSP backend API
5. **[api-svc-05-models.md](_cc/docs/api-svc-05-models.md)** - Business logic models and transfer orchestration
6. **[api-svc-06-state-management.md](_cc/docs/api-svc-06-state-management.md)** - Redis-backed state machines and pub/sub patterns
7. **[api-svc-07-event-handlers.md](_cc/docs/api-svc-07-event-handlers.md)** - Kafka event handlers for domain/command events
8. **[api-svc-08-control-agent.md](_cc/docs/api-svc-08-control-agent.md)** - WebSocket client for PM4ML Management API
9. **[api-svc-09-error-handling.md](_cc/docs/api-svc-09-error-handling.md)** - Error taxonomy, handling patterns, and logging
10. **[api-svc-10-testing.md](_cc/docs/api-svc-10-testing.md)** - Testing strategy (unit, integration, functional)
11. **[api-svc-11-deployment.md](_cc/docs/api-svc-11-deployment.md)** - Kubernetes deployment with Helm charts, production configuration
