"use strict";

/**
 * vlad the validator
 */

var error = require('./error');

var mappings = {};

var types = {
	server_id: function(e) { return types.int(d); },
	client_id: function(d) { return d.toString().match(/^[a-f0-9]+$/i); },
	int: function(d) { return !!parseInt(d); },
	array: function(d) { return Array.isArray(d); },
	string: function(d) { return typeof(d) == 'string'; },
	email: function(d) { return d.toString().match(/.@./); },
	object: function(d) { return typeof(d) == 'object' && !Array.isArray(d); },
	float: function(d) { return !!parseFloat(d); },
	bool: function(d) { return d === true || d === false; },
	// recursive vlad type
	vlad: function(type) {
		return function(d) { return exports.validate(type, d); };
	},
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
	if(!data) throw new error.internal('bad data passed to validator: '+typeof(data));
	Object.keys(mapping).forEach(function(map_key) {
		var field = mapping[map_key];
		var val = data[map_key];
		// treat null/undefined as the same
		var is_empty = (val === undefined || val === null);
		// if required and missing, complain
		if(field.required && is_empty) {
			throw new error.bad_request(type+' object failed validation: missing required field `'+map_key+'`');
		}
		// if missing and not required, set default if we have it, otherwise
		// nothing to see here
		if(is_empty) {
			if(field.default) {
				if(field.default instanceof Function) {
					data[map_key] = field.default(data);
				} else {
					data[map_key] = field.default;
				}
			}
			return;
		}

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

