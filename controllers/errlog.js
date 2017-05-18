var model = require('../models/errlog');
var tres = require('../helpers/tres');
var analytics = require('../models/analytics');

exports.route = function(app) {
	app.post('/log/error', log_error);
};

var log_error = function(req, res) {
	var log_data = req.body.data;
	var client = req.header('X-Turtl-Client');
	var promise = model.log_error(log_data)
		.tap(function(data) {
			analytics.track(null, 'error.log', client, {hash: data.hash});
		});
	tres.wrap(res, promise);
};

