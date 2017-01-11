var db = require('../helpers/db');
var Promise = require('bluebird');
var sync_model = require('./sync');
var vlad = require('../helpers/validator');
var error = require('../helpers/error');

vlad.define('space', {
	id: {type: vlad.type.client_id, required: true},
	user_id: {type: vlad.type.int, required: true},
	keys: {type: vlad.type.array},
	body: {type: vlad.type.string},
});

sync_model.register('space', {
	add: add,
	edit: edit,
	delete: del,
	link: link,
});

// our roles
var roles = {
	owner: 'owner',
	admin: 'admin',
	moderator: 'moderator',
	member: 'member',
	guest: 'guest',
};
// permissions enum for actions allowed inside of a space
var permissions = {
	// spaces
	edit_space: 'edit-space',
	delete_space: 'delete-space',
	set_space_owner: 'set-space-owner',
	add_space_invite: 'add-space-invite',
	delete_space_invite: 'delete-space-invite',

	// boards
	add_board: 'add-board',
	edit_board: 'edit-board',
	delete_board: 'delete-board',

	// notes
	add_note: 'add-note',
	edit_note: 'edit-note',
	delete_note: 'delete-note',
};
// make a catch-all admin role that has all but a few permissions
var admin_role = Object.keys(permissions).map(function(key) {
	// some space actions are above admins
	if(['set_space_owner', 'delete_space'].indexOf(key) >= 0) return;
	return permissions[key];
});
// assign individual permissions for each role
var role_permissions = {
	owner: admin_role.concat([
		permissions.set_space_owner,
		permissions.delete_space,
	]),
	admin: admin_role,
	moderator: [
		permissions.add_board,
		permissions.edit_board,
		permissions.delete_board,
		permissions.add_note,
		permissions.edit_note,
		permissions.delete_note,
	],
	member: [
		permissions.add_note,
		permissions.edit_note,
		permissions.delete_note,
	],
	guest: [],	// haha read only suckerrrrAHAHAAHGGGGGGGGRRRRRGRYTHADJK;
};
exports.permissions = permissions;
exports.roles = roles;

/**
 * make sure the given user has the ability to perform the given action.
 */
exports.permissions_check = function(user_id, space_id, permission) {
	return get_space_user_record(user_id, space_id)
		.then(function(space_user) {
			if(!space_user) throw error.forbidden('you don\'t have access to space '+space_id);
			var role = space_user.role;
			var permissions = role_permissions[role];
			if(permissions.indexOf(permission) >= 0) return true;
			throw error.forbidden('you don\'t have `'+permission+'` permissions on space '+space_id);
		});
};

/**
 * populates member data for a set of spaces
 */
var populate_members = function(spaces) {
	if(spaces.length == 0) return Promise.resolve(spaces);
	var space_ids = spaces.map(function(s) { return s.id; });
	return db.query('SELECT * FROM spaces_users WHERE space_id IN ({{space_ids}})', {space_ids: db.literal(space_ids.join(','))})
		.then(function(space_users) {
			var space_idx = {};
			spaces.forEach(function(space) { space_idx[space.id] = space; });
			space_users.forEach(function(user) {
				var space = space_idx[user.space_id];
				if(!space) return;
				if(!space.data) space.data = {};
				if(!space.data.members) space.data.members = [];
				space.data.members.push(user);
			});
			return spaces;
		});
};

/**
 * grab a space by id
 */
var get_by_id = function(space_id) {
	return db.by_id('spaces', space_id)
		.then(function(space) { return space.data; });
};

/**
 * given a space id, pull out all user_ids accociated with the spaces.
 *
 * this is GREAT for generating sync records for boards/notes/invites
 */
exports.get_space_user_ids = function(space_id) {
	return db.query('SELECT user_id FROM spaces_users WHERE space_id = {{space_id}}')
		.then(function(res) {
			return res.map(function(rec) { return rec.user_id; });
		});
};

/**
 * get all spaces attached to a user
 */
exports.get_by_user_id = function(user_id) {
	var qry = [
		'SELECT',
		'	s.*',
		'FROM',
		'	spaces s,',
		'	spaces_users su',
		'WHERE',
		'	s.id = su.space_id AND',
		'	su.user_id = {{uid}}',
	].join('\n');
	return db.query(qry, {uid: user_id})
		.then(populate_members);
};

/**
 * get a space <--> user link record (which includes the space-user permissions)
 */
var get_space_user_record = function(user_id, space_id) {
	var qry = 'SELECT * FROM spaces_users WHERE space_id = {{space_id}} AND user_id = {{user_id}}';
	return db.first(qry, {space_id: space_id, user_id: user_id});
};

/**
 * get the data tree for a space (all the boards/notes/invites contained in it).
 */
exports.get_data_tree = function(space_id) {
	return Promise.all([
		get_by_id(space_id),
		board_model.get_by_space_id(space_id),
		note_model.get_by_space_id(space_id),
		invite_model.get_by_space_id(space_id),
	])
};

/**
 * get the spaces a user admins, optionally spaces that the user is the only
 * admin of
 */
exports.get_users_owned_spaces = function(user_id, options) {
	options || (options = {});
	var sole_owner = options.sole_owner;

	return exports.get_by_user_id(user_id)
		.then(function(spaces) {
			return spaces
				.filter(function(space) {
					var i_am_admin = false;
					var number_of_admins = 0;
					(space.members || []).forEach(function(member) {
						var roles = (member.data || {}).roles || [];
						if(roles.indexOf('admin') >= 0)
						{
							number_of_admins++;
							if(member.user_id == user_id) i_am_admin = true;
						}
					});
					if(sole_owner) return i_am_admin && number_of_admins == 1;
					else return i_am_admin;
				});
		});
};

var add = function(user_id, data) {
	data.user_id = user_id;
	var data = vlad.validate('space', data);
	return db.insert('spaces', {id: data.id, data: data})
		.tap(function(space) {
			return db.insert('spaces_users', {space_id: space.id, user_id: user_id, permissions: roles.owner});
		})
		.tap(function(space) {
			return sync_model.add_record([user_id], user_id, 'space', space.id, 'add')
				.then(function(sync_ids) {
					space.sync_ids = sync_ids;
				});
		});
};

var edit = function(user_id, data) {
	var space_id = data.id;
	var data = vlad.validate('space', data);
	return exports.permissions_check(user_id, space_id, permissions.edit_space)
		.then(function(_) {
			return get_by_id(space_id)
				.then(function(space_data) {
					// preserve user_id
					data.user_id = space_data.user_id;
					return db.update('spaces', space_id, {data: data});
				});
		})
		.tap(function(space) {
			return exports.get_space_user_ids(space_id)
				.then(function(user_ids) {
					return sync_model.add_record(user_ids, user_id, 'space', space_id, 'edit')
				})
				.then(function(sync_ids) {
					space.sync_ids = sync_ids;
				});
		});
};

var del = function(user_id, space_id) {
	return exports.permissions_check(user_id, space_id, permissions.delete_space)
		.then(function(_) {
			return db.delete('spaces', space_id);
		})
		.then(function(_) {
			return exports.get_space_user_ids(space_id)
				.then(function(user_ids) {
					return sync_model.add_record(user_ids, user_id, 'space', space_id, 'edit')
				});
		});
};

var link = function(ids) {
	return db.by_ids('spaces', ids, {fields: ['data']})
		.then(function(spaces) {
			return populate_members(spaces);
		})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

