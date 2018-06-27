FROM node:8.9.4-alpine
RUN apk update
RUN apk add git bash
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
COPY config/config.yaml.default config/config.yaml
EXPOSE 8181
CMD ./scripts/init.sh \
	&& node server.js

