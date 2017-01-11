var db = require('../helpers/db');
var config = require('../helpers/config');
var Promise = require('bluebird');
var error = require('../helpers/error');
var crypto = require('crypto');
var sync_model = require('./sync');
var space_model = require('./space');
var board_model = require('./board');
var note_model = require('./note');
var invite_model = require('./invite');

sync_model.register('user', {
	edit: edit,
	link: link,
});

/**
 * does a pbkdf2 on our private data using the app's SECRET hash
 */
var secure_hash = function(privatedata, options) {
	options || (options = {});
	var iter = options.iter || 100000;
	var output = options.output || 'hex';

	var res = crypto.pbkdf2Sync(privatedata, config.app.secure_hash_salt, iter, 128, 'sha256');
	return res.toString(output);
};

/**
 * who needs constant-time comparisons when you can just double-hmac?
 */
var secure_compare = function(secret1, secret2) {
	var now = new Date().getTime();
	var hmac1 = crypto.createHmac('sha256', now+'|'+config.app.secure_hash_salt).update(secret1).digest('base64');
	var hmac2 = crypto.createHmac('sha256', now+'|'+config.app.secure_hash_salt).update(secret2).digest('base64');
	return hmac1 == hmac2;
};

var clean_user = function(user) {
	delete user.auth;
	return user;
};

exports.check_auth = function(authinfo) {
	if(!authinfo) return Promise.reject(error.forbidden('bad login'));
	var base64_auth = authinfo.replace(/^Basic */, '');
	var parsed = new Buffer(base64_auth, 'base64').toString("ascii");
	var auth_parts = parsed.split(':');
	var username = auth_parts[0];
	var auth = auth_parts[1];

	return db.first('SELECT * FROM users WHERE username = {{username}}', {username: username})
		.then(function(user) {
			if(!user) throw error.forbidden('bad login');
			if(!secure_compare(user.auth, secure_hash(auth, {output: 'base64', iter: 2}))) throw error.forbidden('bad login');
			return clean_user(user);
		});
};

exports.join = function(userdata) {
	if(!userdata.auth) return Promise.reject(error.bad_request('missing `auth` key'));
	if(!userdata.username) return Promise.reject(error.bad_request('missing `username` key (should be a valid email)'));

	// check existing username
	return db.first('SELECT id FROM users WHERE username = {{username}} LIMIT 1', {username: userdata.username})
		.then(function(existing) {
			if(existing) throw error.forbidden('the username "'+userdata.username+'" already exists');
			// two iterations. yes, two. if someone gets the database, they
			// won't be able to crack the real auth key out of it since it's
			// just a binary blob anyway, meaning this step only exists to keep
			// them from being able to impersonate the user (not to hide the
			// secret it holds, since there IS no secret...even if they cracked
			// the auth data, they'd have to have the user's key to decrypt it).
			var auth = secure_hash(userdata.auth, {output: 'base64', iter: 2});
			return db.insert('users', {
				username: userdata.username,
				auth: auth,
				data: db.json(userdata.data),
				storage_mb: 100
			});
		})
		.then(clean_user);
};

exports.delete = function(cur_user_id, user_id) {
	if(cur_user_id != user_id) return Promise.reject(error.forbidden('you cannot delete an account you don\'t own'));

	return space_model.get_users_owned_spaces(user_id, {sole_owner: true})
		.then(function(my_spaces) {
			// TODO
			throw new Error('unimplemented');
		});
};

var edit = function(user_id, data) {
	if(user_id != data.id) return Promise.reject(error.forbidden('you cannot edit someone else\'s user record. shame shame.'));
	return db.update('users', user_id, {data: data})
		.tap(function(user) {
			return sync_model.add_record([], user_id, 'user', user_id, 'edit')
				.then(function(sync_ids) {
					user.sync_ids = sync_ids;
				});
		});
};

var link = function(ids) {
	return db.by_ids('users', ids, {fields: ['data']})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

