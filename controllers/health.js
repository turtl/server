var tres = require('../helpers/tres');
var user_model = require('../models/user');

exports.route = function(app) {
	app.get('/health/db', db_health);
};

var db_health = function(req, res) {
	var userpromise = user_model.get_by_id(1)
		.then(function(_user) { return {healthy: true}; });
	return tres.wrap(res, userpromise);
};

