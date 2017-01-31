"use strict";

/**
 * vlad the validator
 */

var error = require('./error');

var mappings = {};

var types = {
	client_id: function(d) { return d.toString().match(/^[a-f0-9]+$/i); },
	int: function(d) { return !!parseInt(d); },
	array: function(d) { return Array.isArray(d); },
	string: function(d) { return typeof(d) == 'string'; },
	object: function(d) { return typeof(d) == 'object' && !Array.isArray(d); },
	float: function(d) { return !!parseFloat(d); },
	bool: function(d) { return d === true || d === false; },
};
exports.type = types;

exports.define = function(type, mapping) {
	mappings[type] = mapping;
};

/**
 * validate an object type against a set of data
 */
exports.validate = function(type, data) {
	var mapping = mappings[type];
	if(!mapping) throw new error.internal('unknown validation type: `'+type+'`');
	Object.keys(mapping).forEach(function(map_key) {
		var field = mapping[map_key];
		var val = data[map_key];
		// if required and missing, complain
		if(field.required && val === undefined) {
			throw new error.bad_request(type+' object failed validation: missing required field `'+map_key+'`');
		}
		// if missing and not required, nothing to see here
		if(val === undefined) return;
		// if we have a type mismatch, complain
		if(!field.type(val)) {
			throw new error.bad_request(type+' object failed validation: field `'+map_key+'` is not the right type');
		}
	});
	Object.keys(data).forEach(function(data_key) {
		// remove data that's not in our schema
		if(!mapping[data_key]) delete data[data_key];
	});
	return data;
};

/**
 * our shitty (but permissive, so also not shitty at all) email validator
 */
exports.email = function(email) {
	var bad_email = error.bad_request('invalid email given');
	if(!email) throw bad_email;
	if(typeof(email) != 'string') throw bad_email;
	if(email.indexOf('@') < 0) throw bad_email;
	return true;
};

