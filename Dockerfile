FROM node:10.16-alpine

RUN apk add --no-cache git

EXPOSE 3000

COPY ./secrets /secrets

COPY ./src/ /src/

COPY package.json .

RUN npm install

CMD ["node", "/src/index.js"]
