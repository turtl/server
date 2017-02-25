"use strict";

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
 * get a keychain entry's data by id
 */
var get_by_id = function(keychain_id) {
	return db.by_id('keychain', keychain_id)
		.then(function(entry) { return entry.data; });
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
	return db.insert('keychain', {id: data.id, data: data})
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
			// preserve user_id
			if(user_id != item_data.user_id) {
				throw error.forbidden('you can\'t edit a keychain entry you don\'t own');
			}
			data.user_id = user_id;
			return db.update('keychain', item_id, {data: data});
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
		});
	return db.delete('keychain', keychain_id)
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

