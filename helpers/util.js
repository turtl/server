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

