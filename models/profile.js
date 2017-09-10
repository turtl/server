var error = require('../helpers/error');
var space_model = require('./space');

exports.get_profile_size = function(user_id) {
	// grab the user's owned spaces
	return space_model.get_by_user_id(user_id, {role: space_model.roles.owner})
		.then(function(owned_spaces) {
			// grab the size for each space
			return Promise.all(owned_spaces.map(function(space) {
				return space_model.get_space_size(space.id);
			}));
		})
		.then(function(space_sizes) {
			return space_sizes.reduce(function(acc, x) { return acc + x; }, 0);
		});
};

