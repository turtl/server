"use strict";

var db = require('../helpers/db');
var Promise = require('bluebird');
var error = require('../helpers/error');
var config = require('../helpers/config');
var sync_model = require('./sync');
var space_model = require('./space');
var user_model = require('./user');
var vlad = require('../helpers/validator');
var crypto = require('crypto');
var email_model = require('./email');
var analytics = require('./analytics');
var util = require('../helpers/util');

vlad.define('invite', {
	id: {type: vlad.type.client_id, required: true},
	space_id: {type: vlad.type.client_id, required: true},
	to_user: {type: vlad.type.email, required: true},
	role: {type: vlad.type.string, required: true},
	is_passphrase_protected: {type: vlad.type.bool, required: true},
	is_pubkey_protected: {type: vlad.type.bool, required: true},
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

var delete_invite = function(space_id, invite_id) {
	var qry = 'DELETE FROM spaces_invites WHERE id = {{invite_id}} AND space_id = {{space_id}}';
	return db.query(qry, {invite_id: invite_id, space_id: space_id});
};

var create_outgoing_invite_sync_record = function(user_id, space_id, invite_id, action) {
	return get_by_id(space_id, invite_id)
		.then(function(invite) {
			if(!invite) error.promise_throw('invite_empty');
			return user_model.get_by_email(invite.to_user);
		})
		.then(function(to_user) {
			if(!to_user) error.promise_throw('invite_empty');
			var user_ids = [to_user.id];
			return sync_model.add_record(user_ids, user_id, 'invite', invite_id, action);
		})
		.catch(error.promise_catch('invite_empty'), function(err) {
			return [];
		});
};

exports.create_sync_records_for_email = function(user_id, email) {
	var qry = 'SELECT * FROM spaces_invites WHERE to_user = {{email}}';
	return db.query(qry, {email: email})
		.then(function(invites) {
			if(!invites || !invites.length) return [];
			return Promise.all(invites.map(function(invite) {
				return sync_model.add_record([user_id], user_id, 'invite', invite.id, 'add');
			}));
		});
};

exports.send = function(user_id, space_id, data) {
	var invite;
	try {
		data = vlad.validate('invite', data);
	} catch(e) {
		return Promise.reject(e);
	}

	if(space_id != data.space_id) return Promise.reject(error.bad_request('space_id passed does not match space_id in data'));

	var to_user_email = data.to_user;
	return space_model.permissions_check(user_id, space_id, space_model.permissions.add_space_invite)
		.then(function() {
			return Promise.all([
				invite_exists(space_id, to_user_email),
				space_model.member_exists(space_id, to_user_email),
			]);
		})
		.spread(function(invite_exists, member_exists) {
			// don't allow inviting a current member. that's jsut stupid.
			if(member_exists) throw error.bad_request('that user is already a member of this space');
			// don't re-create an existing invite. skip it, don't email, etc etc
			if(invite_exists) error.promise_throw('already_exists', invite_exists);

			return db.insert('spaces_invites', {
				id: data.id,
				space_id: space_id,
				from_user_id: user_id,
				to_user: to_user_email,
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
			var subject = 'You have been invited to a Turtl space by '+from_user.username;
			var name = (from_user.data || {}).name;
			name = name ? name + ' ('+from_user.username+')' : from_user.username;
			var action = '';
			if(to_user) {
				action = [
					'To accept this invite, log into your account ('+to_user.username+')',
					'and open "Sharing" from the Turtl menu.'
				].join(' ');
			} else {
				action = [
					'To accept this invite, download Turtl (https://turtlapp.com/download/)',
					'and create a new account using this email ('+to_user_email+').',
					'\n\nIf you already have an existing account, you can ask '+name,
					'to re-invite you on your existing email.',
					'\n\nIf you don\'t care about any of this, feel free to',
					'ignore this message. Nothing good or bad will happen.',
				].join(' ');
			}
			var body = [
				'Hello. You have been sent an invite by '+name+': '+invite_title,
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
		.catch(error.promise_catch('already_exists'), function(err) {
			var inv = err.already_exists.data;
			inv.sync_ids = [];
			return inv;
		});
};

exports.accept = function(user_id, space_id, invite_id, post_accept_fn) {
	var invite;
	return get_by_id(space_id, invite_id)
		.tap(function(_invite) {
			invite = _invite;
			if(!invite) throw error.not_found('that invite doesn\'t exist');
			return user_model.get_by_id(user_id)
				.then(function(user) {
					if(user.username != invite.to_user) throw error.forbidden('that invite wasn\'t sent to your email ('+user.username+')');
					if(!user.confirmed) throw error.forbidden('you must confirm your account to accept an invite');
					return space_model.user_is_in_space(user_id, space_id);
				})
				.then(function(spaceuser) {
					if(!spaceuser) return;
					throw error.conflict('you are already a member of space '+space_id);
				});
		})
		.tap(function(invite) {
			return space_model.create_space_user_record(space_id, user_id, invite.data.role);
		})
		.tap(function(invite) {
			return delete_invite(space_id, invite_id);
		})
		.then(function(invite) {
			return space_model.get_by_id(space_id, {populate: true})
		})
		.then(function(space) {
			space = space.data;
			return space_model.get_space_user_ids(space_id)
				.tap(function(space_users) {
					return Promise.all([
						sync_model.add_record([user_id], user_id, 'space', space_id, 'share'),
						sync_model.add_record([user_id], user_id, 'invite', invite_id, 'delete'),
						sync_model.add_record(space_users, user_id, 'space', space_id, 'edit'),
					]);
				})
				.then(function(sync_ids_arr) {
					var sync_ids = util.flatten(sync_ids_arr);
					space.sync_ids = sync_ids;
					return space;
				});
		})
		.tap(function(_invite) {
			if(post_accept_fn) post_accept_fn(invite);
			return {accepted: true};
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
				.then(function() {
					return link([invite_id])
						.then(function(invites) { return invites[0]; });
				})
				.then(function(inv) {
					return space_model.get_space_user_ids(space_id)
						.then(function(user_ids) {
							// do an "edit" sync on the space, not the invite.
							return Promise.all([
								sync_model.add_record(user_ids, user_id, 'space', space_id, 'edit'),
								create_outgoing_invite_sync_record(user_id, space_id, invite_id, 'edit'),
							]);
						})
						.spread(function(sync_ids, invite_sync_ids) {
							inv.sync_ids = sync_ids.concat(invite_sync_ids);
							return inv;
						});
				});
		});
};

exports.delete = function(user_id, space_id, invite_id, post_delete_fn) {
	var promises = [
		space_model.user_has_permission(user_id, space_id, space_model.permissions.delete_space_invite),
		user_model.get_by_id(user_id)
			.then(function(user) {
				if(!user) return false;
				return invite_exists(space_id, user.username);
			})
			.then(function(invite) {
				return invite && invite.id == invite_id;
			})
	];
	var is_invitee;
	return Promise.all(promises)
		.spread(function(has_perm, _is_invitee) {
			is_invitee = _is_invitee;
			if(!has_perm && !is_invitee) {
				throw error.forbidden('you do not have access to delete that invite');
			}
			return delete_invite(space_id, invite_id);
		})
		.tap(function() {
			return space_model.get_space_user_ids(space_id)
				.then(function(user_ids) {
					return Promise.all([
						sync_model.add_record(user_ids, user_id, 'space', space_id, 'edit'),
						sync_model.add_record([user_id], user_id, 'invite', invite_id, 'delete'),
					]);
				});
		})
		.tap(function() {
			if(post_delete_fn) post_delete_fn({is_invitee: is_invitee});
		})
		.then(function() {
			return true;
		});
};

exports.get_by_to_email = function(to_email) {
	var qry = 'SELECT id FROM spaces_invites WHERE to_user = {{email}}';
	return db.query(qry, {email: to_email})
		.then(function(invites) {
			if(invites.length == 0) return [];
			return link(invites.map(function(i) { return i.id; }));
		});
};

/**
 * get all invites for a particular space
 */
exports.get_by_space_id = function(space_id) {
	return db.query('SELECT data FROM spaces_invites WHERE space_id = {{space_id}}', {space_id: space_id})
		.then(function(invites) {
			return invites.map(function(i) { return i.data; });
		});
};

/**
 * grab all invites for a given set of space ids
 */
exports.get_by_spaces_ids = function(space_ids) {
	return db.by_ids('spaces_invites', space_ids, {fields: ['id'], id_field: 'space_id'})
		.map(function(invite) { return invite.id; })
		.then(link);
};

var link = function(ids) {
	return db.by_ids('spaces_invites', ids, {fields: ['from_user_id', 'data']})
		.then(function(items) {
			var user_ids = items.map(function(i) { return i.from_user_id; });
			return user_model.get_by_ids(user_ids)
				.then(function(users) {
					var user_idx = {};
					users.forEach(function(user) { user_idx[user.id] = user; });
					return items.map(function(i) {
						var data = i.data;
						var user = user_idx[i.from_user_id] || {};
						data.from_user_id = user.id;
						data.from_username = user.username;
						return data;
					});
				});
		});
};

sync_model.register('invite', {
	link: link,
});

