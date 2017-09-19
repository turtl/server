var plugins = {};

exports.register = function(name, spec) {
	plugins[name] = spec;
};

exports.with = function(name, exists_fn, no_exists_fn) {
	var plugin = plugins[name];
	if(plugin) {
		return exists_fn(plugin);
	} else {
		return no_exists_fn ? no_exists_fn() : null;
	}
};

