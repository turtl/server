#!/bin/bash

if [ "${TURTL_SERVER_PLUGIN_REPO}" != "" ]; then
	if [ "${TURTL_SERVER_PLUGIN_LOCATION}" == "" ]; then
		TURTL_SERVER_PLUGIN_LOCATION="plugins_"
	fi
	git clone ${TURTL_SERVER_PLUGIN_REPO} "${TURTL_SERVER_PLUGIN_LOCATION}" || \
		{ echo "Error grabbing plugins"; exit 1; }
fi

node tools/create-db-schema.js

