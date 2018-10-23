"use strict";

const Promise = require('bluebird');
const plugins = require('../helpers/plugins');

exports.send = function(from, to, subject, body) {
	return plugins.with('email', function(email) {
		return email.send(from, to, subject, body);
	}, Promise.resolve);
};

