var log = require('../helpers/log');
exports.track = function(user_id, action, data, options) {
	data || (data = null);
	options || (options = {});
	// TODO: implement tie-ins for analytics
	log.debug('analytics.track() -- ', user_id, action, data);
};

