"use strict";

var db = require('../helpers/db');
var config = require('../helpers/config');
var Promise = require('bluebird');
var error = require('../helpers/error');
var vlad = require('../helpers/validator');
var crypto = require('crypto');
var sync_model = require('./sync');
var space_model = require('./space');
var board_model = require('./board');
var note_model = require('./note');
var invite_model = require('./invite');
var analytics = require('./analytics');
var email_model = require('./email');

vlad.define('user', {
	public_key: {type: vlad.type.string},
	name: {type: vlad.type.string},
	body: {type: vlad.type.string},
});

/**
 * do a pbkdf2 on our private data using the app's SECRET hash
 */
var secure_hash = function(privatedata, options) {
	options || (options = {});
	var iter = options.iter || 100000;
	var output = options.output || 'hex';

	var res = crypto.pbkdf2Sync(privatedata, config.app.secure_hash_salt, iter, 128, 'sha256');
	return res.toString(output);
};
exports.secure_hash = secure_hash;

/**
 * who needs constant-time comparisons when you can just double-hmac?
 *
 * find out why this one app has password crackers FURIOUS!!!
 */
var secure_compare = function(secret1, secret2) {
	var now = new Date().getTime();
	var hmac1 = crypto.createHmac('sha256', now+'|'+config.app.secure_hash_salt).update(secret1).digest('base64');
	var hmac2 = crypto.createHmac('sha256', now+'|'+config.app.secure_hash_salt).update(secret2).digest('base64');
	return hmac1 == hmac2;
};

/**
 * create a random token. useful for creating values the server knows that users
 * do not (invite tokens et al).
 */
var random_token = function(options) {
	options || (options = {});
	var hash = options.hash || 'sha256';

	var read_it_back_francine = 'and if you ever put your goddamn hands on my wife again, i will...';
	var rand = crypto.randomBytes(64).toString('hex');
	return crypto
		.createHash(hash)
		.update(rand+read_it_back_francine+(new Date().getTime()))
		.digest('hex');
};
exports.random_token = random_token;

/**
 * remove any sensitive data from a user object
 */
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
	if(!userdata.username) return Promise.reject(error.bad_request('missing `username` key (must be a valid email)'));
	if(!userdata.salt) return Promise.reject(error.bad_request('missing `salt` key (must be a hex-encoded 128-bit value)'));
	var data = vlad.validate('user', userdata.data || {});

	// create a confirmation token
	var token = random_token({hash: 'sha512'});
	data.confirmation_token = token;

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
				salt: userdata.salt,
				confirmed: false,
				data: db.json(userdata.data),
				storage_mb: 100
			});
		})
		.tap(function(user) {
			var subject = 'Welcome to Turtl! Please confirm your email';
			var confirmation_url = config.app.api_url+'/users/confirm/'+encodeURIComponent(user.username)+'/'+encodeURIComponent(token);
			var body = [
				'Welcome to Turtl! Your account is active and you\'re ready to start using the app.',
				'',
				'However, sharing is disabled on your account until you confirm your email by going here:',
				'',
				'  '+confirmation_url,
				'',
				'You can resend this confirmation email at any time through the app by opening the Turtl menu and going to Your settings -> Resend confirmation',
				'',
				'Thanks!',
				'- Turtl team',
			].join('\n');
			return email_model.send(config.app.emails.info, user.username, subject, body);
		})
		.tap(function(user) {
			return analytics.join(user.id, {
				$distinct_id: user.id,
				$email: user.username,
				$name: (user.data || {}).name,
			});
		})
		.tap(function(user) {
			return analytics.track(user.id, 'user.join');
		})
		.then(clean_user);
};

exports.confirm_user = function(email, token) {
	return exports.get_by_email(email)
		.then(function(user) {
			if(!user) throw error.not_found('that email isn\'t attached to an active account');
			var data = user.data || {};
			if(user.confirmed) throw error.conflict('that account has already been confirmed');
			var server_token = data.confirmation_token;
			if(!server_token) throw error.internal('that account has no confirmation token');
			if(!secure_compare(token, server_token)) throw error.bad_request('invalid confirmation token');
			delete data.confirmation_token;
			return db.update('users', user.id, {confirmed: true, data: data});
		})
		.tap(function(user) {
			return sync_model.add_record([user.id], user.id, 'user', user.id, 'edit');
		})
		.tap(function(user) {
			// if thre are pending invites sent to the email that was just
			// confirmed, we create invite.add sync records for them so the user
			// sees them in their profile.
			return invite_model.create_sync_records_for_email(user.id, email);
		})
		.then(clean_user);
};

exports.delete = function(cur_user_id, user_id) {
	if(cur_user_id != user_id) return Promise.reject(error.forbidden('you cannot delete an account you don\'t own'));

	var num_spaces = 0;
	return space_model.get_by_user_id(user_id, {role: space_model.roles.owner})
		.then(function(owned_spaces) {
			num_spaces = owned_spaces.length;
			return Promise.all(owned_spaces.map(function(space) {
				return space_model.delete_space(user_id, space.id);
			}));
		})
		.then(function() {
			var params = {user_id: user_id};
			return Promise.all([
				db.query('DELETE FROM keychain WHERE user_id = {{user_id}}', params),
				db.query('DELETE FROM users WHERE id = {{user_id}}', params),
			]);
		})
		.then(function() {
			analytics.track('user.delete', {user_id: user_id, spaces: num_spaces});
		});
};

exports.get_by_id = function(user_id) {
	return db.by_id('users', user_id)
		.then(clean_user);
};

exports.get_by_email = function(email) {
	return db.first('SELECT * FROM users WHERE username = {{email}} LIMIT 1', {email: email})
		.then(clean_user);
};

var edit = function(user_id, data) {
	if(user_id != data.id) return Promise.reject(error.forbidden('you cannot edit someone else\'s user record. shame shame.'));
	var data = vlad.validate('user', data);
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
			return items.map(function(i) {
				var data = i.data || {};
				data.confirmed = !!i.confirmed;
				return data;
			});
		});
};

sync_model.register('user', {
	edit: edit,
	link: link,
});

