FROM node:8.9.4-alpine
RUN apk update
RUN apk add git
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
COPY config/config.yaml.default config/config.yaml
EXPOSE 8181
CMD node tools/create-db-schema.js \
	&& node server.js

