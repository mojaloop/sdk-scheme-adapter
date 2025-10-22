[![Git Commit](https://img.shields.io/github/last-commit/mojaloop/sdk-scheme-adapter.svg?style=flat)](https://github.com/mojaloop/sdk-scheme-adapter/commits/master)
[![Git Releases](https://img.shields.io/github/release/mojaloop/sdk-scheme-adapter.svg?style=flat)](https://github.com/mojaloop/sdk-scheme-adapter/releases)
[![Docker pulls](https://img.shields.io/docker/pulls/mojaloop/sdk-scheme-adapter.svg?style=flat)](https://hub.docker.com/r/mojaloop/sdk-scheme-adapter)
[![Npm Version](https://img.shields.io/npm/v/@mojaloop/sdk-scheme-adapter.svg?style=flat)](https://www.npmjs.com/package/@mojaloop/sdk-scheme-adapter)
[![NPM Vulnerabilities](https://img.shields.io/snyk/vulnerabilities/npm/@mojaloop/sdk-scheme-adapter.svg?style=flat)](https://www.npmjs.com/package/@mojaloop/sdk-scheme-adapter)
[![CircleCI](https://circleci.com/gh/mojaloop/sdk-scheme-adapter.svg?style=svg)](https://circleci.com/gh/mojaloop/sdk-scheme-adapter)

# Mojaloop SDK Scheme Adapter

This package provides a scheme adapter that interfaces between a Mojaloop API compliant switch and a DFSP backend platform that does not natively implement the Mojaloop API.

The API between the scheme adapter and the DFSP backend is synchronous HTTP while the interface between the scheme adapter and the switch is native Mojaloop API.

This package exemplifies the use of the Mojaloop SDK Standard Components for TLS, JWS and ILP (available [here](http://www.github.com/mojaloop/sdk-standard-components)).

For information on the background and context of this project please see the presentation [here](docs/Mojaloop%20-%20Modusbox%20Onboarding%20functionality.pdf)

## DFSP Backend API

DFSP backends must implement the [DFSP Inbound API](docs/dfspInboundApi.yaml) in order for the scheme adapter to make incoming transfers i.e. to receive funds to a customer account.

DFSP backends can call the [DFSP Outbound API](https://github.com/mojaloop/api-snippets/blob/master/docs/sdk-scheme-adapter-outbound-v2_0_0-openapi3-snippets.yaml) in order to make outgoing transfers i.e. to send funds from a customer account.

## Docker Image

### Official Packaged Release

This package is available as a pre-built docker image on Docker Hub: [https://hub.docker.com/r/mojaloop/sdk-scheme-adapter](https://hub.docker.com/r/mojaloop/sdk-scheme-adapter)


### Build from Source

You can also build it directly from source: [https://github.com/mojaloop/sdk-scheme-adapter](https://github.com/mojaloop/sdk-scheme-adapter)

However, take note of the default argument in the [Dockerfile](./Dockerfile) for `NODE_VERSION`:

```dockerfile
ARG NODE_VERSION=lts-alpine
```

It is recommend that you set the `NODE_VERSION` argument against the version set in the local [.nvmrc](./.nvmrc).

This can be done using the following command:

```bash
export NODE_VERSION="$(cat .nvmrc)-alpine3.22"

docker build \
   --build-arg NODE_VERSION=$NODE_VERSION \
   -t mojaloop/sdk-scheme-adapter:local \
   .
```

## NPM Package

Users who do not wish to use all the functionality of the scheme adapter as-is are able to import this package as a dependency into their own projects. The scheme adapter package is [published on npm](https://www.npmjs.com/package/@mojaloop/sdk-scheme-adapter) and exposes the following components for external use:

- Inbound Server Middleware
- Outbound Server Middleware
- Request Router
- Request Validation Framework
- Unique Request Identifier Framework (RandomPhrase)
- Logger
- Distributed Cache Abstraction (uses REDIS as a backing service)

## Quick Start

The steps shown below illustrate setting up the Mojaloop SDK Scheme Adapter locally with a mock DFSP backend.

This configuration is suitable as a starting point for DFSPs wishing to utilize the scheme adapter for integrating their backend systems with a Mojaloop API enabled switch.

_Note that these instructions are for Linux based systems. For Mac and/or Windows you will need to translate the following for your environment._

1. Make sure you have docker and docker-compose installed locally. See [https://docs.docker.com/v17.12/install/](https://docs.docker.com/v17.12/install/) and [https://docs.docker.com/compose/install/](https://docs.docker.com/compose/install/) respectively.
1. Clone the Mojaloop SDK Mock DFSP Backend repository locally:

   Change directory into your workspace then to clone using HTTPS:

   ```bash
   $ git clone https://github.com/mojaloop/sdk-mock-dfsp-backend.git
   ```

   or to clone using SSH:

   ```bash
   $ git clone git@github.com:mojaloop/sdk-mock-dfsp-backend.git
   ```

   Now change directory into the cloned repository directory:

   ```bash
   $ cd sdk-mock-dfsp-backend
   ```

1. Edit the scheme adapter configuration to point the scheme adapter at your Mojaloop API enabled switch or simulator:

   Use your favourite text editor to edit the file `src/scheme-adapter.env`.
   Change the value of the `PEER_ENDPOINT` variable to the DNS name or IP address and port number of your Mojaloop API enabled switch or simulator. Save the file.

1. Use docker-compose to download and run the pre-built scheme-adapter, shared cache and mock DFSP backend containers locally:

   Change directory into the `src` subfolder and run docker-compose

   ```bash
   $ cd src/
   $ docker-compose up
   ```

   You should see docker download the pre-built docker images for the scheme adapter, shared cache (redis) and mock DFSP backend. Docker-compose will start the containers.

1. Test the outbound (sending money) API:

   Find the IP address of the mock DFSP backend container. To do this you can use...

   ```bash
   docker network ls
   ```

   to find the list of docker networks on your local machine. Identity the docker network created by docker-compose, docker-compose will assign a name based on the directory name from which you ran the `docker-compose up` command.

   Once you have identified the network you can use...

   ```bash
   docker network inspect {network name}
   ```

   This will print a JSON structure to the terminal containing the set of containers in the network and their individual IP addresses.

   Use the following command to tell the mock DFSP backend to initiate an outbound money transfer via the scheme-adapter:

   _Dont forget to substitute in the correct IP address for the Mock DFSP Backend container_

   ```bash
   curl -X POST \
     http://{MOCK Container IP Address}:3000/send \
     -H 'Content-Type: application/json' \
     -d '{
       "from": {
           "displayName": "John Doe",
           "idType": "MSISDN",
           "idValue": "123456789"
       },
       "to": {
           "idType": "MSISDN",
           "idValue": "987654321"
       },
       "amountType": "SEND",
       "currency": "USD",
       "amount": "100",
       "transactionType": "TRANSFER",
       "note": "test payment",
       "homeTransactionId": "123ABC"
   }'
   ```

   The response from the above call should indicate the result of the communication between the scheme-adapter and the Mojaloop API enabled switch or simulator.

1. Speak to your switch operator or use your simulator to test the inbound (receiving money) API.

You can now examine the code of the Mock DFSP backend to understand how it implements the scheme-adapter simplified inbound API.


## Observability Configuration

### TRACE_FLAGS

Controls the trace flags value in the W3C Trace Context `traceparent` header generated by the SDK.

- **Environment Variable**: `TRACE_FLAGS`
- **Format**: Two-character lowercase hexadecimal string (00-ff)
- **Default**: `01` (sampled flag set)
- **Example**: `TRACE_FLAGS=00` or `TRACE_FLAGS=01`

The trace flags field indicates trace sampling options according to the [W3C Trace Context specification](https://www.w3.org/TR/trace-context/):
- `00`: No flags set (not sampled)
- `01`: Sampled flag set (trace should be sampled)
- Custom values can be used for specific observability requirements

## Testing

### Unit Tests

Unit tests can be found in the `./src/test/unit` directory, and follow the same directory structure of the main project.

Run the unit tests with the following (from `./src` dir):

```bash
npm run test
```

### Integration Tests

```bash
docker-compose -f docker-compose.yml build
docker-compose -f docker-compose.yml up -d
./docker/wait4/wait4.js cicd-integration-tests
cd src
npm run test:int
cd ../
docker-compose -f docker-compose.yml down

# test report you can find in
src/junit.xml
```

If you want to use Redis Insights, you can start it as follows:
<!-- TODO: Add this as part of the Docker Compose -->
```bash
docker run -itd -p 8001:8001 --network="mojaloop-net" redislabs/redisinsight
```

And open http://localhost:8001 in your browser.

### Get status of quote request

The status of a previously sent quotation request can be get by executing `GET /quotes/{ID}`.
When the response to the original quote request is sent, the response is cached in the redis store. When a `GET /quotes/{ID}` is received,
the cached response is retrieved from the redis store and returned to the caller as a body with `PUT /quotes/{ID}` request.
When the redis is setup as a persistent store then it will return the response for all the quote requests sent with `POST /quotes`. If the the redis is setup as cache with expiry time then it will not return response for the expired quotes when the cache expires. Also only the payer dfsp is supposed to make the `GET /quotes/{ID}` request.
If the quote response is not found in the redis store `PUT /quotes/{ID}` will be made with the following body

```json
{
   "errorInformation":{
      "errorCode":"3205",
      "errorDescription":"Quote ID not found"
   }
}
```

### Dev Tools

This project uses @redocly/openapi-cli and @mojaloop/api-snippets to build interfaces.

Any interface changes should be done in the corresponding `api-template.yaml`
file and then rebuilt using the command below or the `build:openapi` scripts.

```bash
openapi bundle --output api.yaml --ext yaml api_template.yaml
```

To rebuild the inbound interface run

```bash
npm run build:openapi:inbound
```

## Automated Releases

As part of our CI/CD process, we use a combination of CircleCI, standard-version
npm package and github-release CircleCI orb to automatically trigger our releases
and image builds. This process essentially mimics a manual tag and release.

On a merge to master, CircleCI is configured to use the mojaloopci github account
to push the latest generated CHANGELOG and package version number.

Once those changes are pushed, CircleCI will pull the updated master, tag and
push a release triggering another subsequent build that also publishes a docker image.

### Potential problems

*   There is a case where the merge to master workflow will resolve successfully, triggering
    a release. Then that tagged release workflow subsequently failing due to the image scan,
    audit check, vulnerability check or other "live" checks.

    This will leave master without an associated published build. Fixes that require
    a new merge will essentially cause a skip in version number or require a clean up
    of the master branch to the commit before the CHANGELOG and bump.

    This may be resolved by relying solely on the previous checks of the
    merge to master workflow to assume that our tagged release is of sound quality.
    We are still mulling over this solution since catching bugs/vulnerabilities/etc earlier
    is a boon.

*   It is unknown if a race condition might occur with multiple merges with master in
    quick succession, but this is a suspected edge case.

### Running monorepo

- Start the dependencies

```bash
docker-compose up
```

- Run application

```bash
nvm use
yarn install
yarn run build
export API_SERVER_ENABLED=true
yarn run start
```

This starts all the modules in the monorepo.
Note: api-svc is failing to start at the moment.

- Produce a domain event with the following test code

```bash
yarn workspace @mojaloop/sdk-scheme-adapter-outbound-domain-event-handler run test:integration
```

- Observe the bulk transaction state using test API
Go to `http://localhost:8000/docs/` and execute the `GET /bulkTransactionsState` request and see response

- Redis commands to observe

```redis
KEYS *
HKEYS outboundBulkTransaction_b51ec534-ee48-4575-b6a9-ead2955b8069
HGET outboundBulkTransaction_b51ec534-ee48-4575-b6a9-ead2955b8069 bulkTransactionEntityState
HGET outboundBulkTransaction_b51ec534-ee48-4575-b6a9-ead2955b8069 individualItem_<individualTransferIDHere>
```

Note: If you run test code multiple times, you may observe duplicate individual transfer added to the same bulk transaction. Duplicate check should be implemented somewhere to handle this.
