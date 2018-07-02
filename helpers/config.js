"use strict";

const log = require('./log');
const yaml_env = require('yaml-env');
const URL = require('url');

var config_file = 'config.yaml';
if(process.env['TURTL_CONFIG_FILE']) {
	config_file = process.env['TURTL_CONFIG_FILE'];
}
var config = yaml_env.load('TURTL', __dirname+'/../config/'+config_file);

var db_url = process.env['DATABASE_URL'];
if(db_url && db_url.match(/^postgres:/)) {
	var url = URL.parse(db_url);
	// to: from
	var copy = {
		'host': 'hostname',
		'port': 'port',
		'database': 'pathname',
		'user': 'auth',
		'password': 'auth',
	};
	Object.keys(copy).forEach(function(key_to) {
		var key_from = copy[key_to];
		var urlval = url[key_from];
		if(urlval) {
			if(key_from == 'pathname') {
				urlval = urlval.split('/')[1];
			}
			if(key_from == 'auth' && key_to == 'user') {
				urlval = urlval.split(':')[0];
			}
			if(key_from == 'auth' && key_to == 'password') {
				urlval = urlval.split(':')[1];
			}
			config.db[key_to] = urlval;
		}
	});
}
if(process.env['PORT']) {
	config.server.port = parseInt(process.env['PORT']);
}
if(process.env['TURTL_CONFIG_OVERRIDE']) {
	try {
		var override = JSON.parse(process.env['TURTL_CONFIG_OVERRIDE']);
		Object.keys(override).forEach(function(key) {
			config[key] = override[key];
		});
	} catch(e) {
		log.warn('config -- error parsing TURTL_CONFIG_OVERRIDE: ', e);
	}
}
module.exports = config;

