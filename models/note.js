"use strict";

var db = require('../helpers/db');
var sync_model = require('./sync');

sync_model.register('note', {
	add: add,
	edit: edit,
	delete: del,
	link: link,
});

sync_model.register('file', {
	delete: delete_note_file,
	link: link,
});

exports.get_by_space_id = function(space_id) {
	return db.query('SELECT data FROM notes WHERE space_id = {{space_id}}', {space_id: space_id})
		.then(function(notes) {
			return notes.map(function(n) { return n.data; });
		});
};

var add = function(user_id, data) {
};

var edit = function(user_id, data) {
};

var del = function(user_id, note_id) {
};

var delete_note_file = function(user_id, note_id) {
};

var link = function(ids) {
	return db.by_ids('notes', ids, {fields: ['data']})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

