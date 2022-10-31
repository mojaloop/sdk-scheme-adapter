# Arguments
ARG NODE_VERSION=16.15.0-alpine

# Build Image
FROM node:${NODE_VERSION} as builder

## Install tool dependencies
RUN apk add --no-cache -t build-dependencies make gcc g++ python3 libtool libressl-dev openssl-dev autoconf automake yarn

WORKDIR /opt/app

## Copy Root files
COPY ./package.json .
COPY ./yarn.lock .
COPY ./.yarnrc.yml .
COPY ./.yarn/releases/ ./.yarn/releases/
COPY ./.yarn/plugins/ ./.yarn/plugins/
COPY ./.nvmrc .
COPY ./nx.json .
COPY ./tsconfig.json .

## Copy Package.json for each module
## TODO: Dynamically pull in package.json
COPY ./modules/api-svc/package.json ./modules/api-svc/package.json
COPY ./modules/outbound-command-event-handler/package.json ./modules/outbound-command-event-handler/package.json
COPY ./modules/outbound-domain-event-handler/package.json ./modules/outbound-domain-event-handler/package.json
COPY ./modules/private-shared-lib/package.json ./modules/private-shared-lib/package.json

## Install dependencies
RUN yarn install --immutable

# Build Run-time image
FROM node:${NODE_VERSION}
WORKDIR /opt/app

RUN apk add --no-cache yarn

ARG BUILD_DATE
ARG VCS_URL=https://github.com/mojaloop/sdk-scheme-adapter
ARG VCS_REF
ARG VERSION=latest

## See http://label-schema.org/rc1/ for label schema info
LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.name="sdk-scheme-adapter"
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.label-schema.vcs-url=$VCS_URL
LABEL org.label-schema.vcs-ref=$VCS_REF
LABEL org.label-schema.url="https://mojaloop.io/"
LABEL org.label-schema.version=$VERSION

## Create a non-root user: ml-user
RUN adduser -D ml-user

## Create ml-user
USER ml-user

## Update permissions for ml-user
COPY --chown=ml-user --from=builder /opt/app .

## Copy over any src changes
COPY --chown=ml-user ./modules/ ./modules/

## Run any build scripts
RUN yarn run build

## Expose ports
### INBOUND API PORT
EXPOSE 4000
### OUTBOUND API PORT
EXPOSE 4001
### TEST API PORT
EXPOSE 4002

## Set default run command
CMD ["yarn", "run", "start"]
