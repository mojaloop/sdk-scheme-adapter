FROM node:10.15.3-alpine

RUN apk add --no-cache -t build-dependencies git make gcc g++ python libtool autoconf automake \
        && cd $(npm root -g)/npm \
        && npm config set unsafe-perm true \
        && npm install -g node-gyp

RUN apk add --no-cache git python build-base \
    && npm install -g node-gyp

EXPOSE 3000

COPY ./secrets /

WORKDIR /src/

CMD ["node", "/src/index.js"]

COPY ./src/ /src/
RUN npm install --production
