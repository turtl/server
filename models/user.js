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
var keychain_model = require('./keychain');
var analytics = require('./analytics');
var email_model = require('./email');
var profile_model = require('./profile');

vlad.define('user', {
	username: {type: vlad.type.email},
	pubkey: {type: vlad.type.string},
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
 * find out why this one weird app has password crackers FURIOUS!!!
 */
var secure_compare = function(secret1, secret2) {
	var now = new Date().getTime();
	var key = now+'|'+config.app.secure_hash_salt;
	var hmac1 = crypto.createHmac('sha256', key).update(secret1).digest('base64');
	var hmac2 = crypto.createHmac('sha256', key).update(secret2).digest('base64');
	return hmac1 == hmac2;
};

/**
 * create a random token. useful for creating values the server knows that users
 * do not (invite tokens et al).
 */
var random_token = function(options) {
	options || (options = {});
	var hash = options.hash || 'sha256';

	var rand = crypto.randomBytes(64);
	return crypto
		.createHash(hash)
		.update(rand)
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

var auth_hash = function(authkey) {
	// two iterations. yes, two. if someone gets the database, they
	// won't be able to crack the real auth key out of it since it's
	// just a binary blob anyway, meaning this step only exists to keep
	// them from being able to impersonate the user (not to hide the
	// secret it holds, since there IS no secret...even if they cracked
	// the auth data, they'd have to have the user's key to decrypt it).
	return secure_hash(authkey, {output: 'base64', iter: 2});
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
			if(!user.active) throw error.forbidden('user inactive');
			if(!secure_compare(user.auth, auth_hash(auth))) throw error.forbidden('bad login');
			return clean_user(user);
		});
};

exports.join = function(userdata) {
	if(!userdata.auth) return Promise.reject(error.bad_request('missing `auth` key'));
	if(!userdata.username) return Promise.reject(error.bad_request('missing `username` key (must be a valid email)'));
	if(!userdata.username.match(/@/)) return Promise.reject(error.bad_request('please enter a valid email'));
	try {
		var data = vlad.validate('user', userdata.data || {});
	} catch(e) {
		return Promise.reject(e);
	}

	// create a confirmation token
	var token = random_token({hash: 'sha512'});

	// check existing username
	return db.first('SELECT id FROM users WHERE username = {{username}} LIMIT 1', {username: userdata.username})
		.then(function(existing) {
			if(existing) throw error.forbidden('the account "'+userdata.username+'" already exists');
			var auth = auth_hash(userdata.auth);
			return db.insert('users', {
				username: userdata.username,
				auth: auth,
				active: true,
				confirmed: false,
				confirmation_token: token,
				data: db.json(data),
			});
		})
		.tap(function(user) {
			// DON'T return. if the confirmation email fails, the user can send
			// again through the settings interface
			send_confirmation_email(user);
		})
		.tap(function(user) {
			return analytics.join(user.id, {
				$distinct_id: user.id,
				$email: user.username,
				$name: (user.data || {}).name,
			});
		})
		.then(clean_user);
};

var send_confirmation_email = function(user) {
	var subject = 'Welcome to Turtl! Please confirm your email';
	var confirmation_url = config.app.api_url+'/users/confirm/'+encodeURIComponent(user.username)+'/'+encodeURIComponent(user.confirmation_token);
	var body = [
		'Welcome to Turtl! Your account is active and you\'re ready to start using the app.',
		'',
		'However, sharing is disabled on your account until you confirm your email by going here:',
		'',
		confirmation_url,
		'',
		'You can resend this confirmation email at any time through the app by opening the Turtl menu and going to Your settings -> Resend confirmation',
		'',
		'Thanks!',
		'- Turtl team',
		].join('\n');
	return email_model.send(config.app.emails.info, user.username, subject, body)
		.catch(function(err) {
			throw error.internal('problem sending confirmation email: '+err.message);
		});
};

exports.confirm_user = function(email, token) {
	return exports.get_by_email(email, {raw: true})
		.then(function(user) {
			if(!user) throw error.not_found('that email isn\'t attached to an active account');
			if(user.confirmed) throw error.conflict('that account has already been confirmed');
			var server_token = user.confirmation_token;
			if(!server_token) throw error.internal('that account has no confirmation token');
			if(!secure_compare(token, server_token)) throw error.bad_request('invalid confirmation token');
			return db.update('users', user.id, {confirmed: true, confirmation_token: null});
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

exports.resend_confirmation = function(user_id) {
	return db.by_id('users', user_id)
		.then(function(user) {
			if(!user) throw error.not_found('weird, your user account wasn\'t found');
			if(user.confirmed) throw error.bad_request('your account is already confirmed');
			return send_confirmation_email(user);
		})
		.then(function() { return true; });
};

exports.delete = function(cur_user_id, user_id) {
	if(cur_user_id != user_id) return Promise.reject(error.forbidden('you cannot delete an account you don\'t own'));

	return space_model.get_by_user_id(user_id, {role: space_model.roles.owner})
		.then(function(owned_spaces) {
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
			return true;
		});
};

exports.update = function(cur_user_id, user_id, data) {
	// error checking
	if(cur_user_id != user_id) {
		return Promise.reject(error.forbidden('you cannot edit another user\'s account'));
	}
	var keys = ['user', 'auth', 'keychain'];
	for(var i = 0; i < keys.length; i++) {
		var key = keys[i];
		if(!data[key]) {
			return Promise.reject(error.bad_request('missing `'+key+'` in update data'));
		}
	}
	if(!data.user.username) {
		return Promise.reject(error.bad_request('missing `user.username` in update data'));
	}
	if(!data.user.body) {
		return Promise.reject(error.bad_request('missing `user.body` in update data'));
	}

	// this is going to get a bit "manual" but we need to manage our connection
	// by hand so we can "transact."
	var client = null;
	var user = null;
	var username_changed = false;
	var existing_keychain_idx = null;
	return exports.get_by_id(user_id)
		.then(function(_user) {
			user = _user;
			if(user.username != data.user.username) username_changed = true;
			return keychain_model.get_by_user(user_id);
		})
		// make sure the given keychain matches the keychain the profile. this
		// is important because if the the user is out of sync and missing a key
		// when re-encrypting their profile, they're going to lose data.
		.then(function(existing_keychain) {
			// index our keychain
			existing_keychain_idx = {};
			existing_keychain.forEach(function(k) {
				existing_keychain_idx[k.id] = k;
			});

			// simple length check. so simple. a CHILD could do it.
			if(existing_keychain.length != data.keychain.length) {
				// as for the health service, marijuana will be made available
				// free on the NHS for de treatment of chronic diseases.
				//
				// ...such as itchy scrot.
				throw error.conflict('the given keychain doesn\'t match what is in your profile. try clearing local data and try again/');
			}

			// now check that each entry in the db exists in the given keychain.
			data.keychain.forEach(function(key) {
				if(existing_keychain_idx[key.id]) return;
				// in the candy, candy center of your world.
				// there's a poison pumped up in your heart.
				// the tunnels are all twisted up in knots.
				// noone really finds the way back home.
				throw error.conflict('the given keychain doesn\'t match what is in your profile. try clearing local data and try again/');
			});
			return db.client();
		})
		// start our transaction
		.then(function(_client) {
			client = _client;
			return client.query('BEGIN');
		})
		// update the user. spill the wine.
		.then(function() {
			var auth = auth_hash(data.auth);
			var qry = ['UPDATE users'];
			var sets = [
				'auth = {{auth}}',
				'data = {{data}}',
			];
			var userdata = user.data;
			userdata.body = data.user.body;
			var vals = {
				auth: auth,
				data: db.json(userdata),
				user_id: user_id,
			};
			if(username_changed) {
				var confirmation_token = random_token({hash: 'sha512'});
				sets.push('username = {{username}}');
				sets.push('confirmed = false');
				sets.push('confirmation_token = {{token}}');
				vals.username = data.user.username;
				vals.token = confirmation_token;
			}
			qry.push('SET '+sets.join(', '));
			qry.push('WHERE id = {{user_id}}');
			return client.query(qry.join('\n'), vals);
		})
		// now update the keychain. take that girl.
		.then(function() {
			// loop over each entry, save them one by one. really we just need
			// to update the data.body with the new keydata, so our update is
			// simple.
			return Promise.each(data.keychain, function(key) {
				var keydata = existing_keychain_idx[key.id];
				keydata.body = key.body;
				var qry = [
					'UPDATE keychain',
					'SET data = {{data}}',
					'WHERE id = {{id}}',
				];
				var vals = {
					data: db.json(keydata),
					id: key.id,
				};
				return client.query(qry.join('\n'), vals);
			});
		})
		// spillthewinespillthewinespillthewine
		.then(function() {
			return client.query('COMMIT');
		})
		.then(function() {
			return space_model.get_members_from_users_spaces(user_id);
		})
		// make sync records for our sensitive shit
		.then(function(users_spaces_members) {
			var promises = [
				sync_model.add_record([user_id], user_id, 'user', user_id, 'change-password'),
			];
			data.keychain.forEach(function(key) {
				promises.push(sync_model.add_record([user_id], user_id, 'keychain', key.id, 'edit'));
			});
			var space_idx = {};
			users_spaces_members.forEach(function(member_rec) {
				var space_id = member_rec.space_id;
				if(!space_idx[space_id]) space_idx[space_id] = [];
				space_idx[space_id].push(member_rec.user_id);
			});
			Object.keys(space_idx).forEach(function(space_id) {
				promises.push(sync_model.add_record(space_idx[space_id], user_id, 'space', space_id, 'edit'));
			});
			return Promise.all(promises)
				.then(function(ids_arr) {
					return {sync_ids: ids_arr.map(function(s) { return s[0]; })};
				});
		})
		.tap(function() {
			if(!username_changed) return;
			// i don't want to be your buddy, rick. i just...want a little confirmation?
			return exports.resend_confirmation(user_id);
		})
		.finally(function() {
			client && client.close();
		});
};

exports.get_by_ids = function(user_ids, options) {
	options || (options = {});
	return db.by_ids('users', user_ids)
		.each(clean_user)
		.map(function(user) {
			if(options.profile_size) {
				return profile_model.get_profile_size(user.id)
					.then(function(size) {
						user.profile_size = size;
						return user;
					});
			} else {
				return user;
			}
		})
		.map(function(user) {
			if(!options.data) return user;
			var data = user.data;
			['id', 'username', 'confirmed', 'profile_size'].forEach(function(field) {
				data[field] = user[field];
			});
			return data;
		});
};

exports.get_by_id = function(user_id, options) {
	return exports.get_by_ids([user_id], options)
		.then(function(users) {
			return (users || [])[0];
		});
};

exports.get_by_email = function(email, options) {
	options || (options = {});
	return db.first('SELECT * FROM users WHERE username = {{email}} LIMIT 1', {email: email})
		.then(function(user) {
			if(!user) return null;
			if(options.raw) return user;
			if(options.data) {
				var data = user.data;
				['id', 'username', 'confirmed'].forEach(function(field) {
					data[field] = user[field];
				});
				return data;
			}
			return clean_user(user);
		});
};

exports.get_by_emails = function(emails) {
	return db.by_ids('users', emails, {id_field: 'username'})
};

var edit = function(user_id, data) {
	if(user_id != data.id) return Promise.reject(error.forbidden('you cannot edit someone else\'s user record. shame shame.'));
	data = vlad.validate('user', data);
	return db.update('users', user_id, {data: data})
		.tap(function(user) {
			return sync_model.add_record([], user_id, 'user', user_id, 'edit')
				.then(function(sync_ids) {
					user.sync_ids = sync_ids;
				});
		});
};

var link = function(ids) {
	return exports.get_by_ids(ids, {data: true});
};

sync_model.register('user', {
	edit: edit,
	link: link,
});

