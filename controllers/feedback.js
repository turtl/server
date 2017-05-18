var tres = require('../helpers/tres');
var model = require('../models/feedback');
var analytics = require('../models/analytics');

exports.route = function(app) {
	app.post('/feedback', send_feedback);
};

var send_feedback = function(req, res) {
	var data = req.body;
	var user_id = req.user.id;
	var username = req.user.username;
	var client = req.header('X-Turtl-Client');
	var promise = model.send(user_id, username, client, data)
		.tap(function() {
			analytics.track(user_id, 'feedback.send', client);
		});
	tres.wrap(res, promise);
};

