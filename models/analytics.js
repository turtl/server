"use strict";

var Promise = require('bluebird');
var plugins = require('../helpers/plugins');
var config = require('../helpers/config');
var log = require('../helpers/log');

/**
 * Track an analytics event
 */
exports.track = function(user_id, action, client, data) {
	return plugins.with('analytics', function(analytics) {
		return analytics.track(user_id, action, client, data);
	}, Promise.resolve);
};

/**
 * Lets analytics know about a new user
 */
exports.join = function(user_id, userdata) {
	return plugins.with('analytics', function(analytics) {
		return analytics.join(user_id, userdata);
	}, Promise.resolve);
};

