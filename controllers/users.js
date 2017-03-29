var model = require('../models/user');
var tres = require('../helpers/tres');
var config = require('../helpers/config');
var log = require('../helpers/log');

exports.route = function(app) {
	app.post('/users', join);
	app.get('/users/:user_id', get_by_id);
	app.post('/auth', authenticate);
	app.get('/users/confirm/:email/:token', confirm_user);
	app.delete('/users/:user_id', delete_account);
	app.post('/users/confirmation/resend', resend_confirmation);
};

/**
 * create a new user account
 */
var join = function(req, res) {
	var data = req.body;
	tres.wrap(res, model.join(data));
};

var get_by_id = function(req, res) {
	var user_id = req.params.user_id;
	var cur_user_id = req.user.id;
	if(user_id != cur_user_id) {
		return tres.err(res, new Error('you can\'t grab another user\'s info'));
	}
	tres.wrap(res, model.get_by_id(user_id, {data: true}));
};

/**
 * a basic endpoint specifically for authentication
 */
var authenticate = function(req, res) {
	return tres.send(res, req.user.id);
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

var resend_confirmation = function(req, res) {
	tres.wrap(res, model.resend_confirmation(req.user.id));
};

/**
 * removes a user's account and all data owned by only that user
 */
var delete_account = function(req, res) {
	var cur_user_id = req.user.id;
	var user_id = req.params.user_id;
	tres.wrap(res, model.delete(cur_user_id, user_id));
};

