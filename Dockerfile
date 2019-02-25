FROM node:11-alpine

ARG TURTL_SERVER_PLUGIN_REPO
ARG TURTL_SERVER_PLUGIN_LOCATION

EXPOSE 8181
WORKDIR /app
COPY . .
COPY config/config.yaml.docker config/config.yaml

RUN apk add -U bash git &&\
  npm install --production &&\
  ./scripts/install-plugins.sh &&\
  mkdir /plugins /uploads

ENTRYPOINT ["/app/entrypoint.sh"]
