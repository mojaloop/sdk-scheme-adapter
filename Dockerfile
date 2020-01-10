FROM node:12.14.0-alpine

RUN apk add --no-cache git python build-base

EXPOSE 3000

COPY ./secrets /

WORKDIR /src/

CMD ["node", "/src/index.js"]

COPY ./src/ /src/
RUN npm install --production
RUN npm rebuild
