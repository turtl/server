var model = require('../models/user');
var tres = require('../helpers/tres');

exports.route = function(app) {
	app.post('/users', join);
	app.post('/auth', authenticate);
	app.delete('/users/:user_id', delete_account);
};

/**
 * create a new user account
 */
var join = function(req, res) {
	var data = req.body;
	return model.join(data)
		.then(tres.send.bind(tres, res))
		.catch(tres.err.bind(tres, res));
};

/**
 * a basic endpoint specifically for authentication
 */
var authenticate = function(req, res) {
	return tres.send(res, {ok: true});
};

/**
 * removes a user's account and all data owned by only that user
 */
var delete_account = function(req, res) {
	var cur_user_id = req.user.id;
	var user_id = req.params.user_id;
	return model.delete(cur_user_id, user_id)
		.then(tres.send.bind(tres, res))
		.catch(tres.err.bind(tres, res));
};
