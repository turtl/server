var model = require('../models/user');
var tres = require('../helpers/tres');
var config = require('../helpers/config');
var log = require('../helpers/log');

exports.route = function(app) {
	app.post('/users', join);
	app.post('/auth', authenticate);
	app.get('/users/confirm/:email/:token', confirm_user);
	app.delete('/users/:user_id', delete_account);
};

/**
 * create a new user account
 */
var join = function(req, res) {
	var data = req.body;
	tres.wrap(res, model.join(data));
};

/**
 * a basic endpoint specifically for authentication
 */
var authenticate = function(req, res) {
	return tres.send(res, {ok: true});
};

var confirm_user = function(req, res) {
	var email = req.params.email;
	var token = req.params.token;
	return model.confirm_user(email, token)
		.then(function() {
			tres.redirect(res, config.app.www_url+'/users/confirm/success', {confirmed: true});
		})
		.catch(function(err) {
			if(!err.app_error) log.error('confirm user error: ', err);
			tres.redirect(res, config.app.www_url+'/users/confirm/error?err='+encodeURIComponent(err.message), {confirmed: false, error: err.message});
		});
};

/**
 * removes a user's account and all data owned by only that user
 */
var delete_account = function(req, res) {
	var cur_user_id = req.user.id;
	var user_id = req.params.user_id;
	tres.wrap(res, model.delete(cur_user_id, user_id));
};

