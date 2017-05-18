var tres = require('../helpers/tres');
var model = require('../models/feedback');

exports.route = function(app) {
	app.post('/feedback', send_feedback);
};

var send_feedback = function(req, res) {
	var data = req.body;
	var user_id = req.user.id;
	var username = req.user.username;
	var client = req.header('X-Turtl-Client');
	tres.wrap(res, model.send(user_id, username, client, data));
};

