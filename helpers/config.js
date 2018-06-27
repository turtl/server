"use strict";

const log = require('./log');
const yaml_env = require('yaml-env');

var config_file = 'config.yaml';
if(process.env['TURTL_CONFIG_FILE']) {
	config_file = process.env['TURTL_CONFIG_FILE'];
}
var config = yaml_env.load('TURTL', __dirname+'/../config/'+config_file);
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

