FROM node:8.9.4-alpine
RUN apk update
RUN apk add git bash
EXPOSE 8181
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY scripts .
RUN ./scripts/install-plugins.sh
COPY . .
COPY config/config.yaml.default config/config.yaml
CMD ./scripts/init-db.sh \
	&& node server.js

