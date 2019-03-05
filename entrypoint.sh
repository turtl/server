#!/bin/bash

if [[ -z "${TURTL_APP_SECURE_HASH_SALT}" ]]; then
  echo "TURTL_APP_SECURE_HASH_SALT is unset."
  exit 1
fi

./scripts/init-db.sh
node server.js $@
