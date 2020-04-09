FROM node:12.14.0-alpine as builder

RUN apk add --no-cache git python build-base

EXPOSE 3000

COPY ./secrets /

WORKDIR /sim/

# This is super-ugly, but it means we don't have to re-run npm install every time any of the source
# files change- only when any dependencies change- which is a superior developer experience when
# relying on docker-compose.
COPY ./package.json /sim/package.json
COPY ./src/lib/cache/package.json /sim/src/lib/cache/package.json
COPY ./src/lib/log/package.json /sim/src/lib/log/package.json
COPY ./src/lib/model/lib/requests/package.json /sim/src/lib/model/lib/requests/package.json
COPY ./src/lib/model/lib/shared/package.json /sim/src/lib/model/lib/shared/package.json
COPY ./src/lib/model/package.json /sim/src/lib/model/package.json
COPY ./src/lib/randomphrase/package.json /sim/src/lib/randomphrase/package.json
COPY ./src/lib/router/package.json /sim/src/lib/router/package.json
COPY ./src/lib/validate/package.json /sim/src/lib/validate/package.json
RUN npm install --production

FROM node:12.14.0-alpine

ARG BUILD_DATE
ARG VCS_URL
ARG VCS_REF
ARG VERSION

# See http://label-schema.org/rc1/ for label schema info
LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.name="finance-portal-ui"
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.label-schema.vcs-url=$VCS_URL
LABEL org.label-schema.vcs-ref=$VCS_REF
LABEL org.label-schema.url="https://mojaloop.io/"
LABEL org.label-schema.version=$VERSION

WORKDIR /sim/

COPY --from=builder /sim/ /sim
COPY ./src ./src
COPY ./secrets /
RUN npm prune --production

CMD ["node", "src/index.js"]
