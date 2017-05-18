"use strict";

var Promise = require('bluebird');
var crypto = require('crypto');
var db = require('../helpers/db');

var hash_log = function(logdata) {
	var ensure_string = function(x) { return typeof(x) == 'string' ? x : x.toString(); };
	var hashable = [
		logdata.msg,
		logdata.url,
		logdata.line,
		logdata.version,
	].map(ensure_string).join('');
	return crypto.createHash('md5').update(hashable).digest('hex');
};

exports.log_error = function(logdata) {
	if(typeof(logdata) == 'string') {
		try {
			logdata = JSON.parse(logdata);
		} catch(e) {
			return Promise.reject(e);
		}
	}
	if(!logdata) return Promise.resolve({});
	var client_version = logdata.version;
	if(!client_version) return Promise.resolve({});
	logdata.url = logdata.url.replace(/^.*\/data\/app/, '/data/app');
	var hash = hash_log(logdata);
	return db.upsert('errorlog', {id: hash, data: logdata}, 'id')
		.then(function() {
			return {hash: hash};
		});
};

