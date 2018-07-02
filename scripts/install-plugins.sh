#!/bin/bash

if [ "${TURTL_SERVER_PLUGIN_REPO}" != "" ]; then
	if [ "${TURTL_SERVER_PLUGIN_LOCATION}" == "" ]; then
		TURTL_SERVER_PLUGIN_LOCATION="plugins"
	fi
	git clone ${TURTL_SERVER_PLUGIN_REPO} "${TURTL_SERVER_PLUGIN_LOCATION}" || \
		{ echo "Error grabbing plugins"; exit 1; }
	pushd "${TURTL_SERVER_PLUGIN_LOCATION}"
	npm install || \
		{ echo "Error installing plugin deps"; exit 1; }
	popd
fi

