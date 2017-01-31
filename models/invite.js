"use strict";

var db = require('../helpers/db');
var error = require('../helpers/error');
var config = require('../helpers/config');
var sync_model = require('./sync');
var space_model = require('./space');
var user_model = require('./user');
var vlad = require('../helpers/validator');
var crypto = require('crypto');
var email_model = require('./email');
var analytics = require('./analytics');

vlad.define('invite', {
	id: {type: vlad.type.client_id, required: true},
	space_id: {type: vlad.type.client_id, required: true},
	role: {type: vlad.type.string, required: true},
	has_password: {type: vlad.type.bool, required: true},
	title: {type: vlad.type.string, required: true},
	body: {type: vlad.type.string},
});

var get_by_id = function(space_id, invite_id) {
	var qry = 'SELECT * FROM spaces_invites WHERE id = {{id}} AND space_id = {{space_id}} LIMIT 1';
	return db.first(qry, {id: invite_id, space_id: space_id});
};

/**
 * check if an invite to a given user for a space already exists (returns the
 * entire invite object if so)
 */
var invite_exists = function(space_id, to_email) {
	var qry = 'SELECT * FROM spaces_invites WHERE to_user = {{to_user}} AND space_id = {{space_id}}';
	return db.first(qry, {to_user: to_email, space_id: space_id});
};

var clean = function(invite) {
	delete invite.token_server;
	return invite;
};

var create_outgoing_invite_sync_record = function(user_id, space_id, invite_id, action) {
	return get_by_id(space_id, invite_id)
		.then(function(invite) {
			if(!invite) throw {invite_empty: true};
			return user_model.get_by_email(invite.to_user);
		})
		.then(function(to_user) {
			if(!to_user) throw {invite_empty: true};
			var user_ids = [to_user.id];
			return sync_model.add_record(user_ids, user_id, 'invite', invite_id, action);
		})
		.catch(function(err) { return err.invite_empty === true; }, function(err) {
			return [];
		});
};

exports.send = function(user_id, to_user_email, space_id, data) {
	var invite;
	var data = vlad.validate('invite', data);
	vlad.email(to_user_email);
	return space_model.permissions_check(user_id, space_id, space_model.permissions.add_space_invite)
		.then(function() {
			return invite_exists(space_id, to_user_email);
		})
		.then(function(exists) {
			// don't re-create an existing invite. skip it, don't email, etc etc
			if(exists) throw {already_exists: exists};

			// create a random token for our invite. brute forcers HATE this one
			// simple trick!!!
			var token = user_model.random_token();

			return db.insert('spaces_invites', {
				from_user_id: user_id,
				to_user: to_user_email,
				token: token,
				data: db.json(data),
			});
		})
		.then(function(_invite) {
			// store the invite in our top-level binding
			invite = _invite;
			return Promise.all([
				user_model.get_by_email(to_user_email),
				user_model.get_by_id(user_id),
			]);
		})
		.spread(function(to_user, from_user) {
			var invite_title = data.title;
			var subject = 'You have been invited to "'+invite_title+'" by '+from_user.username;
			var name = (from_user.data || {}).name;
			var name = name ? name + ' ('+from_user.username+')' : from_user.username;
			var action = '';
			if(to_user) {
				action = [
					'To accept this invite, log into your account ('+to_user.username+')',
					'and open "Sharing" from the Turtl menu.'
				].join(' ');
			} else {
				action = [
					'To accept this invite, download Turtl (https://turtlapp.com/download/)',
					'and create a new account using this email.\n\n',
					'\n\nIf you already have an account, you can add this email ('+to_user_email+')',
					'as an alias to your account by logging in, opening the',
					'Turtl menu, going to Your settings -> Aliases.',
					'\n\nIf you don\'t care about any of this, feel free to',
					'ignore this message. Nothing good or bad will happen.',
				].join(' ');
			}
			var body = [
				'Hello. You have been invited by '+name+' to "'+invite_title+'".',
				'',
				action,
				'',
				'Have a nice day!',
				'- Turtl team',
			].join('\n');
			return email_model.send(config.app.emails.invites, to_user_email, subject, body)
				.then(function() { return to_user; });
		})
		.then(function(to_user) {
			analytics.track(user_id, 'space-invite', {
				space_id: space_id,
				to: to_user_email,
				role: data.role,
				has_password: data.has_password,
			});

			return space_model.get_space_user_ids(space_id)
				.then(function(space_user_ids) {
					var to_promise = to_user ? 
						sync_model.add_record([to_user.id], user_id, 'invite', invite.id, 'add') :
						[];
					return Promise.all([
						sync_model.add_record(space_user_ids, user_id, 'space', space_id, 'edit'),
						to_promise,
					]);
				});
		})
		.spread(function(space_sync_ids, invite_sync_ids) {
			var inv = invite.data;
			inv.sync_ids = space_sync_ids.concat(invite_sync_ids);
			return inv;
		})
		.catch(function(err) { return err.already_exists; }, function(err) {
			var inv = err.already_exists.data;
			inv.sync_ids = [];
			return inv;
		});
};

exports.update = function(user_id, space_id, invite_id, data) {
	return space_model.permissions_check(user_id, space_id, space_model.permissions.edit_space_invite)
		.then(function() {
			return get_by_id(space_id, invite_id);
		})
		.then(function(invite) {
			if(!invite) throw error.not_found('invite '+invite_id+' (in space '+space_id+') not found');
			var invite_data = invite.data;
			invite_data.role = data.role;
			var update = {
				data: invite_data
			};
			return db.update('spaces_invites', invite_id, update)
				.tap(function(item) {
					return space_model.get_space_user_ids(space_id)
						.then(function(user_ids) {
							// do an "edit" sync on the space, not the invite.
							return Promise.all([
								sync_model.add_record(user_ids, user_id, 'space', space_id, 'edit'),
								create_outgoing_invite_sync_record(user_id, space_id, invite_id, 'edit'),
							]);
						})
						.spread(function(sync_ids, invite_sync_ids) {
							item.sync_ids = sync_ids.concat(invite_sync_ids);
						});
				});
		});
};

exports.delete = function(user_id, space_id, invite_id) {
	return space_model.permissions_check(user_id, space_id, space_model.permissions.delete_space_invite)
		.then(function() {
			var qry = 'DELETE FROM invites WHERE invite_id = {{invite_id}} AND space_id = {{space_id}}';
			return db.query(qry, {invite_id: invite_id, space_id: space_id});
		});
};

/**
 * get all invites for a particular space
 */
exports.get_by_space_id = function(space_id) {
	return db.query('SELECT data FROM invites WHERE space_id = {{space_id}}', {space_id: space_id})
		.then(function(invites) {
			return invites.map(function(i) { return i.data; });
		});
};

/**
 * grab all invites for a given set of space ids
 */
exports.get_by_spaces_ids = function(space_ids) {
	return db.by_ids('spaces_invites', space_ids, {id_field: 'space_id'})
		.map(clean);
};

