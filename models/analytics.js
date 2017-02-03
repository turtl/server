"use strict";

var config = require('../helpers/config');
var log = require('../helpers/log');
var Mixpanel = require('mixpanel');
var mixpanel = Mixpanel.init(config.analytics.mixpanel.token, {protocol: 'https'});

/**
 * Track an analytics event
 */
exports.track = function(user_id, action, data) {
	if(!config.analytics.enabled) return;
	data || (data = {});
	if(user_id && !data.distinct_id) data.distinct_id = user_id;

	log.debug('analytics.track() -- ', user_id, action, data);

	return mixpanel.track(action, data);
};

/**
 * Lets analytics know about a new user
 */
exports.join = function(user_id, userdata) {
	if(!config.analytics.enabled) return;
	userdata || (userdata = {});
	if(!userdata.distinct_id) userdata.distinct_id = user_id;
	return mixpanel.people.set(user_id, userdata);
};

