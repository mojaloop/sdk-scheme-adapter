# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Mojaloop SDK Scheme Adapter is a monorepo that provides an adapter interface between Mojaloop API compliant switches and DFSP backend platforms. It consists of multiple modules organized as a Yarn workspace using Nx for build orchestration.

## Quick Reference

### Essential Commands

| Task | Command | Prerequisites |
|------|---------|---------------|
| **Install dependencies** | `yarn install` | Node 22.15.1 (`nvm use`) |
| **Build all modules** | `yarn build` | Dependencies installed |
| **Run all tests** | `yarn test:unit` | Built modules |
| **Run integration tests** | `yarn test:integration` | Docker running, `yarn wait-4-docker` |
| **Start all services** | `yarn start` | Docker running, built modules |
| **Start specific service** | `yarn start:api-svc` | Built modules |
| **Run single test** | `yarn workspace @mojaloop/<module> run test:unit -- <test-path>` | - |
| **Update OpenAPI specs** | `yarn build:openapi && yarn validate:api` | - |
| **Check dependencies** | `yarn dep:check` | - |
| **Fix vulnerabilities** | `yarn audit:fix` | - |
| **Lint code** | `yarn lint` | - |
| **Lint and fix** | `yarn lint:fix` | - |

### Module-Specific Commands

For running commands in specific modules, use the workspace syntax:
```bash
yarn workspace @mojaloop/sdk-scheme-adapter-<module-name> run <command>
```

Examples:
- `yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run test:unit`
- `yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run start:debug`
- `yarn workspace @mojaloop/sdk-scheme-adapter-outbound-command-event-handler run build`

## Architecture

### Core Modules

1. **api-svc** (JavaScript/Node.js)
   - Main service handling inbound/outbound HTTP APIs
   - Implements FSPIOP protocol compliance
   - State machine-based transfer processing
   - Entry point: `modules/api-svc/src/index.js`

2. **outbound-command-event-handler** (TypeScript)
   - Processes outbound command events
   - Domain-driven design implementation
   - Kafka consumer/producer for command events

3. **outbound-domain-event-handler** (TypeScript)
   - Handles domain events for outbound operations
   - Event sourcing pattern implementation
   - Processes events from command handler

4. **private-shared-lib** (TypeScript)
   - Shared domain entities and value objects
   - Infrastructure code (Kafka, Redis clients)
   - Common utilities and types

### Key Technical Components

- **Event Streaming**: Kafka for inter-module communication
- **State Management**: Redis for distributed cache and state persistence
- **API Validation**: OpenAPI 3.0 specs with schema validation
- **Configuration**: Convict (TypeScript modules), env-var (api-svc)
- **Testing**: Jest for all modules
- **Build System**: Nx for monorepo orchestration

## Development Workflow

### Initial Setup
```bash
nvm use                    # Switch to correct Node version
yarn install               # Install all dependencies
yarn build                 # Build all modules
docker-compose up -d       # Start infrastructure services
yarn wait-4-docker         # Wait for services to be ready
```

### Running Services

Start all services:
```bash
yarn start                 # Runs all services in parallel
```

Start individual services:
```bash
yarn start:api-svc         # API service only
yarn start:event-handler   # Domain event handler
yarn start:command-handler # Command event handler
```

Debug mode (port 9229):
```bash
yarn workspace @mojaloop/sdk-scheme-adapter-api-svc run start:debug
```

### Testing Strategy

**Unit Tests** (no external dependencies):
```bash
yarn test:unit             # All modules
yarn test:unit:no-cache    # Skip Nx cache
yarn test:unit:affected    # Only changed modules
```

**Integration Tests** (requires Docker):
```bash
docker-compose up -d       # Start dependencies
yarn wait-4-docker         # Ensure services ready
yarn test:integration      # Run integration tests
```

**Coverage Reports**:
```bash
yarn test:coverage         # Generate coverage
yarn test:coverage-check   # Verify thresholds
```

### OpenAPI Development

**IMPORTANT**: Never edit generated `api.yaml` files directly!

1. Edit template files: `modules/*/src/*_template.yaml`
2. Build OpenAPI specs: `yarn build:openapi`
3. Validate specs: `yarn validate:api`

The build process uses `@redocly/openapi-cli` to bundle templates with `@mojaloop/api-snippets`.

## Code Patterns

### API Service (JavaScript)
- **Handlers**: `src/{Inbound,Outbound}Server/handlers.js`
- **Models**: `src/lib/model/*.js` - Business logic
- **State Machines**: `PersistentStateMachine` class with Redis backing
- **Middleware**: `src/InboundServer/middlewares.js`

### TypeScript Modules
- **Domain Layer**: `src/domain/` - Aggregates, entities, value objects
- **Application Layer**: `src/application/handlers/` - Event handlers
- **Infrastructure**: `src/infrastructure/` - External service clients

### State Management
Redis is used for:
- State machine persistence (keys: `transferState_*`, `quoteState_*`)
- Distributed cache
- Pub/sub messaging between modules
- Bulk transaction tracking

### Event Flow
```
Command → outbound-command-event-handler → Domain Events → outbound-domain-event-handler
```
Topics: `topic-sdk-outbound-command-events`, `topic-sdk-outbound-domain-events`

## Docker Environment

**Core Services**:
- Redis (6379) - State & cache
- Kafka (9092) - Event streaming
- ML Testing Toolkit (4040/5050) - Testing
- TTK UI (6060) - Test interface

**Debug Profile** (`docker-compose.debug.yml`):
- RedisInsight (9001) - Redis GUI
- Kafka UI (9080) - Kafka management

**Application Ports**:
- 4000: Outbound API
- 4001: Inbound API
- 9229: Node.js debugger

## Common Troubleshooting

### Build Issues
- Clear Nx cache: `yarn build:no-cache`
- Clean dist folders: `yarn clean:dist`
- Reinstall deps: `rm -rf node_modules && yarn install`

### Test Failures
- Ensure Docker running: `docker ps`
- Wait for services: `yarn wait-4-docker`
- Check Redis: `docker exec -it redis redis-cli ping`
- Check Kafka: `docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092`

### Module Not Found
- Build first: `yarn build`
- Check workspace name in package.json
- Verify module in `yarn workspaces list`

## Configuration

### Environment Variables
- `PEER_ENDPOINT`: Mojaloop switch URL
- `BACKEND_ENDPOINT`: DFSP backend URL
- `CACHE_HOST`/`CACHE_PORT`: Redis connection
- `KAFKA_HOST`/`KAFKA_PORT`: Kafka connection
- `LOG_LEVEL`: Logging verbosity

### Configuration Files
- `modules/*/src/config.js` or `default.json`
- Docker env: `docker-compose.env`
- Override with environment variables

## Key Dependencies

- **@mojaloop/sdk-standard-components**: Core SDK functionality
- **@mojaloop/central-services-***: Platform utilities
- **javascript-state-machine**: Transfer state management
- **redis**: v5.x for caching
- **express/koa**: HTTP servers
- **convict**: Configuration (TypeScript)
- **ajv**: JSON schema validation
- **openapi-backend**: Request validation

## Release Process

This project uses standard-version for versioning:
```bash
yarn release              # Create release
yarn snapshot             # Create snapshot version
```

CircleCI handles automated releases on merge to master.