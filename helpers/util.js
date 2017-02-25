"use strict";

/**
 * Run a deep clone of any JSON-serializable object herrp
 */
exports.clone = function(data) {
	return JSON.parse(JSON.stringify(data));
};

/**
 * Dedupe the values in an array
 */
exports.dedupe = function(arr) {
	var seen = {};
	return arr.filter(function(item) {
		if(seen[item]) return false;
		seen[item] = true;
		return true;
	});
};

/**
 * Flatten a multi-dimensional array
 */
exports.flatten = function(arr, options, cur_level) {
	options || (options = {});
	cur_level || (cur_level = 0);
	var max_level = options.max_level || 3;
	if(!Array.isArray(arr)) return arr;
	if(cur_level > max_level) return arr;
	var flattened = [];
	arr.forEach(function(item) {
		if(Array.isArray(item)) {
			flattened = flattened.concat(exports.flatten(item, options, cur_level + 1));
		} else {
			flattened.push(item);
		}
	});
	return flattened;
};

