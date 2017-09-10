var model = require('../models/user');
var tres = require('../helpers/tres');
var config = require('../helpers/config');
var log = require('../helpers/log');
var analytics = require('../models/analytics');
var profile_model = require('../models/profile');

exports.route = function(app) {
	app.post('/users', join);
	app.get('/users/:user_id', get_by_id);
	app.get('/users/email/:email', get_by_email);
	app.post('/auth', authenticate);
	app.get('/users/confirm/:email/:token', confirm_user);
	app.delete('/users/:user_id', delete_account);
	app.post('/users/confirmation/resend', resend_confirmation);
	app.put('/users/:user_id', update_user);
	app.get('/users/:user_id/profile-size', get_profile_size);
};

/**
 * create a new user account
 */
var join = function(req, res) {
	var client = req.header('X-Turtl-Client');
	var data = req.body;
	var promise = model.join(data)
		.tap(function(user) {
			return analytics.track(user.id, 'user.join', client);
		});
	tres.wrap(res, promise);
};

var get_by_id = function(req, res) {
	var user_id = req.params.user_id;
	var cur_user_id = req.user.id;
	if(user_id != cur_user_id) {
		return tres.err(res, new Error('you can\'t grab another user\'s info'));
	}
	tres.wrap(res, model.get_by_id(user_id, {data: true, profile_size: true}));
};

var get_by_email = function(req, res) {
	var email = req.params.email;
	var promise = model.get_by_email(email, {data: true})
		.tap(function(user) { 
			delete user.body;
			delete user.storage_mb;
		});
	tres.wrap(res, promise);
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
	var client = req.header('X-Turtl-Client');
	var promise = model.delete(cur_user_id, user_id)
		.tap(function() {
			analytics.track(user_id, 'user.delete', client, {user_id: user_id});
		});
	tres.wrap(res, promise);
};

/**
 * edit a user. requires a username, an auth token, and the user's entire
 * (encrypted) keychain. this specifically goes outside of the sync system
 * because this is a change that must be ALL OR NOTHING.
 */
var update_user = function(req, res) {
	var cur_user_id = req.user.id;
	var user_id = req.params.user_id;
	var data = req.body;
	tres.wrap(res, model.update(cur_user_id, user_id, data));
};

/**
 * grab the current user's profile size in bytes, along with their usage
 * percentage
 */
var get_profile_size = function(req, res) {
	var cur_user_id = req.user.id;
	var user_id = req.params.user_id;
	if(user_id != cur_user_id) {
		return tres.err(res, new Error('you can\'t get another user\'s profile data'));
	}
	tres.wrap(res, profile_model.get_profile_size(cur_user_id));
};

