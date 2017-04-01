"use strict";

var db = require('../helpers/db');
var sync_model = require('./sync');
var vlad = require('../helpers/validator');
var error = require('../helpers/error');
var space_model = require('./space');
var file_model = require('./file');
var analytics = require('./analytics');

vlad.define('note', {
	id: {type: vlad.type.client_id, required: true},
	space_id: {type: vlad.type.client_id, required: true},
	board_id: {type: vlad.type.client_id},
	user_id: {type: vlad.type.int, required: true},
	has_file: {type: vlad.type.bool, default: false},
	file: {type: vlad.type.vlad('note-file')},
	mod: {type: vlad.type.int},
	keys: {type: vlad.type.array},
	body: {type: vlad.type.string},
});

vlad.define('note-file', {
	id: {type: vlad.type.string, required: true},
	size: {type: vlad.type.int},
	body: {type: vlad.type.string},
});

var get_by_id = function(note_id) {
	return db.by_id('notes', note_id)
		.then(function(note) { return note && note.data; });
};

exports.get_by_spaces = function(space_ids) {
	if(space_ids.length == 0) return Promise.resolve([]);
	return db.by_ids('notes', space_ids, {id_field: 'space_id'})
		.then(function(notes) {
			return notes.map(function(b) { return b.data; });
		});
};

exports.get_by_space_id = function(space_id) {
	return exports.get_by_spaces([space_id]);
};

/**
 * makes sure user has access to attach a file, then returns a streaming
 * function we can use to send the file data to.
 */
exports.attach_file = function(user_id, note_id) {
	var space_id;
	return db.by_id('notes', note_id)
		.then(function(note) {
			if(!note) throw error.not_found('that note doesn\'t exist');
			space_id = note.space_id;
			return space_model.permissions_check(user_id, space_id, space_model.permissions.edit_note);
		})
		.then(function() {
			return file_model.attach(note_id);
		})
		.then(function(stream) {
			var finishfn = function(file_size) {
				return space_model.get_space_user_ids(space_id)
					.then(function(user_ids) {
						return sync_model.add_record(user_ids, user_id, 'note', note_id, 'edit');
					})
					.then(function(sync_ids) {
						// DON'T return, we don't failed analytics to grind the
						// sync to a halt
						analytics.track(user_id, 'file.upload', {size: file_size});
						// return the full note data object (w/ sync ids)
						return get_by_id(note_id)
							.tap(function(notedata) {
								notedata.sync_ids = sync_ids;
							});
					});
			};
			return [
				stream,
				finishfn,
			]
		});
};

/**
 * grab a note's attachment (URL)
 */
exports.get_file_url = function(user_id, note_id) {
	var space_id;
	return db.by_id('notes', note_id)
		.then(function(note) {
			if(!note) throw error.not_found('that note doesn\'t exist');
			space_id = note.space_id;
			return space_model.permissions_check(user_id, space_id, space_model.permissions.edit_note);
		})
		.then(function() {
			return file_model.file_url(note_id);
		});
};

exports.get_by_space_id_board_id = function(space_id, board_id) {
	var qry = [
		'SELECT *',
		'FROM notes',
		'WHERE space_id = {{space_id}} AND board_id = {{board_id}}'
	].join('\n');
	return db.query(qry, {space_id: space_id, board_id: board_id})
};

/**
 * Move a note between spaces. No permissions checks. No syncing.
 */
exports.move_note_space = function(note_id, new_space_id) {
	return db.by_id('notes', note_id)
		.then(function(note_rec) {
			var data = note_rec.data;
			data.space_id = new_space_id;
			var update = {
				space_id: new_space_id,
				data: data,
			};
			return db.update('notes', note_id, update);
		});
};

var add = space_model.simple_add(
	'note',
	'notes',
	space_model.permissions.add_note,
	function(data) { return {id: data.id, space_id: data.space_id, board_id: data.board_id, data: db.json(data)}; }
);

var edit = space_model.simple_edit(
	'note',
	'notes',
	space_model.permissions.edit_note,
	get_by_id,
	function(data) { return {id: data.id, space_id: data.space_id, board_id: data.board_id, data: db.json(data)}; }
);

var del = space_model.simple_delete(
	'note',
	'notes',
	space_model.permissions.delete_note,
	get_by_id
);

var move_space = space_model.simple_move_space(
	'note',
	'notes',
	space_model.permissions.delete_note,
	space_model.permissions.add_note,
	get_by_id
);

var link = function(ids) {
	return db.by_ids('notes', ids, {fields: ['data']})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

var delete_note_file = function(user_id, note_id) {
	return db.by_id('notes', note_id)
		.tap(function(note) {
			return space_model.permissions_check(user_id, note.space_id, space_model.permissions.edit_note);
		})
		.tap(function(note) {
			var data = note.data || {};
			if(!data.has_file) error.promise_throw('missing_file');
			return file_model.delete_attachment(note_id);
		})
		.tap(function(note) {
			// remove the attachment from data
			var data = note.data || {};
			data.has_file = false;
			delete data.file;
			return db.update('notes', note_id, {data: data});
		})
		.then(function(note) {
			return space_model.get_space_user_ids(note.space_id)
				.then(function(user_ids) {
					return sync_model.add_record(user_ids, user_id, 'note', note.id, 'edit');
				});
		})
		.catch(error.promise_catch('missing_file'), function(err) {
			return [];
		});
};

sync_model.register('note', {
	'add': add,
	'edit': edit,
	'delete': del,
	'move-space': move_space,
	'link': link,
});

sync_model.register('file', {
	delete: delete_note_file,
	link: link,
});

