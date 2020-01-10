FROM node:12.14.0-alpine as builder

RUN apk add --no-cache git python build-base

EXPOSE 3000

COPY ./secrets /

WORKDIR /src/

COPY ./src/ /src/
RUN npm install
RUN npm rebuild

FROM node:12.14.0-alpine 

WORKDIR /src/

COPY --from=builder /src/ .
COPY ./secrets /
RUN npm prune --production

CMD ["node", "/src/index.js"]
