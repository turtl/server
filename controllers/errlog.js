var model = require('../models/errlog');
var tres = require('../helpers/tres');

exports.route = function(app) {
	app.post('/log/error', log_error);
};

var log_error = function(req, res) {
	var log_data = req.body.data;
	tres.wrap(res, model.log_error(log_data));
};

