FROM debian:9.4-slim
RUN apt-get update \
	&& apt-get -y install bash git curl gnupg2
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get -y install nodejs
EXPOSE 8181
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY scripts scripts
ARG TURTL_SERVER_PLUGIN_REPO
ARG TURTL_SERVER_PLUGIN_LOCATION
RUN ./scripts/install-plugins.sh
COPY . .
COPY config/config.yaml.default config/config.yaml
CMD ./scripts/init-db.sh \
	&& node server.js

