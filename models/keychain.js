"use strict";

var Promise = require('bluebird');
var db = require('../helpers/db');
var sync_model = require('./sync');
var error = require('../helpers/error');
var vlad = require('../helpers/validator');

vlad.define('keychain', {
	id: {type: vlad.type.client_id, required: true},
	type: {type: vlad.type.string, required: true},
	item_id: {type: vlad.type.client_id, required: true},
	user_id: {type: vlad.type.int, required: true},
	body: {type: vlad.type.string, required: true},
});

/**
 * Delete a keychain entry given a user id/item id. Be careful with this: it
 * doesn't check any ownership/permissions, so use selectively.
 */
exports.delete_by_user_item = function(user_id, item_id, options) {
	options || (options = {});
	if(!user_id || !item_id) return Promise.resolve([]);

	var qry = 'SELECT * FROM keychain WHERE user_id = {{user_id}} AND item_id = {{item_id}} LIMIT 1';
	return db.first(qry, {user_id: user_id, item_id: item_id})
		.then(function(entry) {
			if(!entry) return [];
			return del(user_id, entry.id);
		});
};

/**
 * get a keychain entry's data by id
 */
var get_by_id = function(keychain_id) {
	return db.by_id('keychain', keychain_id)
		.then(function(entry) { return entry && entry.data; });
};

exports.get_by_user = function(user_id) {
	var qry = 'SELECT * FROM keychain WHERE user_id = {{user_id}}';
	return db.query(qry, {user_id: user_id})
		.then(function(keychain) {
			return (keychain || []).map(function(entry) {
				return entry.data;
			});
		});
};

var add = function(user_id, data) {
	data.user_id = user_id;
	var data = vlad.validate('keychain', data);
	return db.insert('keychain', {id: data.id, user_id: user_id, item_id: data.item_id, data: data})
		.tap(function(item) {
			return sync_model.add_record([user_id], user_id, 'keychain', item.id, 'add')
				.then(function(sync_ids) {
					item.sync_ids = sync_ids;
				});
		});
};

var edit = function(user_id, data) {
	var data = vlad.validate('keychain', data);
	return get_by_id(data.id)
		.then(function(item_data) {
			if(!item_data) throw error.not_found('that keychain entry is missing');
			// preserve user_id
			if(user_id != item_data.user_id) {
				throw error.forbidden('you can\'t edit a keychain entry you don\'t own');
			}
			data.user_id = user_id;
			return db.update('keychain', data.id, {item_id: data.item_id, data: data});
		})
		.tap(function(item) {
			return sync_model.add_record([user_id], user_id, 'keychain', item.id, 'edit')
				.then(function(sync_ids) {
					item.sync_ids = sync_ids;
				});
		});
};

var del = function(user_id, keychain_id) {
	return get_by_id(keychain_id)
		.then(function(item_data) {
			if(user_id != item_data.user_id) {
				throw error.forbidden('you can\'t delete a keychain entry you don\'t own');
			}
			return db.delete('keychain', keychain_id)
		})
		.then(function(_) {
			return sync_model.add_record([user_id], user_id, 'keychain', keychain_id, 'delete')
		});
};

var link = function(ids) {
	return db.by_ids('keychain', ids, {fields: ['data']})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

sync_model.register('keychain', {
	add: add,
	edit: edit,
	delete: del,
	link: link,
});

