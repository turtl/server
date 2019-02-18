#!/bin/bash

if [ -z "${TURTL_SERVER_PORT}" ]; then TURTL_SERVER_PORT=8181; fi

if [ -z "${TURTL_DB_HOST}" ]; then TURTL_DB_HOST="db"; fi
if [ -z "${TURTL_DB_PORT}" ]; then TURTL_DB_PORT=5432; fi
if [ -z "${TURTL_DB_DATABASE}" ]; then TURTL_DB_DATABASE="turtl"; fi
if [ -z "${TURTL_DB_USER}" ]; then TURTL_DB_USER="turtl"; fi
if [ -z "${TURTL_DB_PASSWORD}" ]; then TURTL_DB_PASSWORD=""; fi
if [ -z "${TURTL_DB_POOL}" ]; then TURTL_DB_POOL=24; fi

if [ -z "${TURTL_LOGLEVEL}" ]; then TURTL_LOGLEVEL="info"; fi

if [ -z "${TURTL_APP_ENABLE_BOOKMARKER_PROXY}" ]; then TURTL_APP_ENABLE_BOOKMARKER_PROXY="false"; fi
if [ -z "${TURTL_APP_API_URL}" ]; then TURTL_APP_API_URL="http://127.0.0.1:8181"; fi
if [ -z "${TURTL_APP_WWW_URL}" ]; then TURTL_APP_WWW_URL="https://yourdomain.com"; fi
if [ -z "${TURTL_APP_EMAILS_ADMIN}" ]; then TURTL_APP_EMAILS_ADMIN="admin@turtlapp.com"; fi
if [ -z "${TURTL_APP_EMAILS_INFO}" ]; then TURTL_APP_EMAILS_INFO="Turtl <info@turtlapp.com>"; fi
if [ -z "${TURTL_APP_EMAILS_INVITES}" ]; then TURTL_APP_EMAILS_INVITES="invites@turtlapp.com"; fi
if [ -z "${TURTL_APP_SECURE_HASH_SALT}" ]; then
  echo "TURTL_APP_SECURE_HASH_SALT is unset."
  exit 1
fi
if [ -z "${TURTL_APP_ALLOW_UNCONFIRMED_INVITES}" ]; then TURTL_APP_ALLOW_UNCONFIRMED_INVITES="true"; fi

if [ -z "${TURTL_SYNC_MAX_BULK_SYNC_RECORDS}" ]; then TURTL_SYNC_MAX_BULK_SYNC_RECORDS=32; fi

if [ -z "${TURTL_PLUGINS_PLUGIN_LOCATION}" ]; then TURTL_PLUGINS_PLUGIN_LOCATION="/plugins"; fi
if [ -z "${TURTL_PLUGINS_ANALYTICS}" ]; then TURTL_PLUGINS_ANALYTICS="false"; fi
if [ -z "${TURTL_PLUGINS_EMAIL}" ]; then TURTL_PLUGINS_EMAIL="false"; fi
if [ -z "${TURTL_PLUGINS_PREMIUM}" ]; then TURTL_PLUGINS_PREMIUM="false"; fi

if [ -z "${TURTL_UPLOADS_LOCAL}" ]; then TURTL_UPLOADS_LOCAL="/uploads"; fi
if [ -z "${TURTL_UPLOADS_LOCAL_PROXY}" ]; then TURTL_UPLOADS_LOCAL_PROXY="true"; fi
if [ -z "${TURTL_UPLOADS_URL}" ]; then TURTL_UPLOADS_URL="http://127.0.0.1:8181/uploads"; fi

if [ -z "${TURTL_S3_TOKEN}" ]; then TURTL_S3_TOKEN="IHADAPETSNAKEBUTHEDIEDNOOOOO"; fi
if [ -z "${TURTL_S3_SECRET}" ]; then TURTL_S3_SECRET=""; fi
if [ -z "${TURTL_S3_BUCKET}" ]; then TURTL_S3_BUCKET=""; fi
if [ -z "${TURTL_S3_ENDPOINT}" ]; then TURTL_S3_ENDPOINT="https://s3.amazonaws.com"; fi


cat >/app/config/config.yaml <<EOF
server:
  port: ${TURTL_SERVER_PORT}

db:
  host: '${TURTL_DB_HOST}'
  port: ${TURTL_DB_PORT}
  database: '${TURTL_DB_DATABASE}'
  user: '${TURTL_DB_USER}'
  password: '${TURTL_DB_PASSWORD}'
  pool: ${TURTL_DB_POOL}

loglevel: '${TURTL_LOGLEVEL}'

app:
  enable_bookmarker_proxy: ${TURTL_APP_ENABLE_BOOKMARKER_PROXY}
  # no trailing slash
  api_url: '${TURTL_APP_API_URL}'
  www_url: '${TURTL_APP_WWW_URL}'
  emails:
    admin: '${TURTL_APP_EMAILS_ADMIN}'
    info: '${TURTL_APP_EMAILS_INFO}'
    invites: '${TURTL_APP_EMAILS_INVITES}'
  secure_hash_salt: "${TURTL_APP_SECURE_HASH_SALT}"
  allow_unconfirmed_invites: ${TURTL_APP_ALLOW_UNCONFIRMED_INVITES}

sync:
  # how many sync records can a client send at a time? it's a good idea to have
  # a limit here, lest a rogue client flood the server with sync items
  max_bulk_sync_records: ${TURTL_SYNC_MAX_BULK_SYNC_RECORDS}

plugins:
  plugin_location: '${TURTL_PLUGINS_PLUGIN_LOCATION}'
  analytics:
    enabled: ${TURTL_PLUGINS_ANALYTICS}
  email:
    enabled: ${TURTL_PLUGINS_EMAIL}
  premium:
    enabled: ${TURTL_PLUGINS_PREMIUM}

uploads:
  local: '${TURTL_UPLOADS_LOCAL}'
  local_proxy: ${TURTL_UPLOADS_LOCAL_PROXY}
  url: '${TURTL_UPLOADS_URL}'

s3:
  token: '${TURTL_S3_TOKEN}'
  secret: '${TURTL_S3_SECRET}'
  bucket: '${TURTL_S3_BUCKET}'
  endpoint: '${TURTL_S3_ENDPOINT}'
EOF

./scripts/init-db.sh
node server.js $@
