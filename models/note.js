"use strict";

var db = require('../helpers/db');
var sync_model = require('./sync');
var vlad = require('../helpers/validator');
var error = require('../helpers/error');
var config = require('../helpers/config');
var space_model = require('./space');
var file_model = require('./file');
var analytics = require('./analytics');
var util = require('../helpers/util');

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
	size: {type: vlad.type.int},
	body: {type: vlad.type.string},
});

var get_by_id = function(note_id) {
	return db.by_id('notes', note_id)
		.then(function(note) { return note && note.data; });
};
exports.get_by_id = get_by_id;

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
				var note = null;
				return db.by_id('notes', note_id)
					.then(function(_note) {
						note = _note;
						note.data.has_file = true;
						var file = note.data.file || {};
						file.size = file_size;
						note.data.file = file;
						return db.update('notes', note_id, {data: note.data});
					})
					.then(function() {
						return space_model.get_space_user_ids(space_id);
					})
					.then(function(user_ids) {
						return Promise.all([
							sync_model.add_record(user_ids, user_id, 'note', note_id, 'edit'),
							sync_model.add_record(user_ids, user_id, 'file', note_id, 'add'),
						]);
					})
					.then(function(sync_ids) {
						note.data.sync_ids = util.flatten(sync_ids);
						return note.data;
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

/**
 * grab a local file upload and return the stream
 */
exports.pipe_local_file = function(user_id, note_id) {
	var space_id;
	return db.by_id('notes', note_id)
		.then(function(note) {
			if(!note) throw error.not_found('that note doesn\'t exist');
			space_id = note.space_id;
			return space_model.permissions_check(user_id, space_id, space_model.permissions.edit_note);
		})
		.then(function() {
			return file_model.stream_local(note_id);
		});
};

var add = space_model.simple_add(
	'note',
	'notes',
	space_model.permissions.add_note,
	function(data) {
		delete data.has_file;
		return {id: data.id, space_id: data.space_id, board_id: data.board_id, data: db.json(data)};
	}
);

var edit = space_model.simple_edit(
	'note',
	'notes',
	space_model.permissions.edit_note,
	get_by_id,
	function(data, existing) {
		data.has_file = existing.has_file;
		return {id: data.id, space_id: data.space_id, board_id: data.board_id, data: db.json(data)};
	}
);

var delete_note = space_model.simple_delete(
	'note',
	'notes',
	space_model.permissions.delete_note,
	get_by_id
);

// wrap `delete_note`/simple_delete to also remove the note's file AND create a
// corresponding file.delete sync record
var del = function(user_id, note_id) {
	var sync_ids = [];
	var note = null;
	return get_by_id(note_id)
		.then(function(_note) {
			note = _note;
			return delete_note(user_id, note_id);
		})
		.then(function(_sync_ids) {
			sync_ids = _sync_ids;
			if(!note) throw error.promise_throw('doesnt_exist');
			return delete_note_file_sync(user_id, note.space_id, note_id);
		})
		.then(function(delete_sync_ids) {
			return sync_ids.concat(delete_sync_ids || []);
		})
		.catch(error.promise_catch('doesnt_exist'), function() {
			return sync_ids;
		});
};
exports.delete_note = del;

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

/**
 * delete a note's file, no permission checks or note editing. this is mainly
 * called when a note is being deleted and we want to a) delete the note's file
 * along with the note and b) create a `file.delete` sync record so the client
 * doesn't have to manage creating sync records for child objects.
 */
var delete_note_file_sync = function(user_id, space_id, note_id) {
	return file_model.delete_attachment(note_id)
		.then(function() {
			return space_model.get_space_user_ids(space_id);
		})
		.then(function(user_ids) {
			return sync_model.add_record(user_ids, user_id, 'file', note_id, 'delete');
		});
};

/**
 * delete a note's file, meant to be called from the sync system. this does NOT
 * create a file.delete sync record because that sync record already exists =]
 */
var delete_note_file = function(user_id, note_id) {
	return db.by_id('notes', note_id)
		.tap(function(note) {
			if(!note) throw error.promise_throw('missing_note');
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
		.catch(error.promise_catch('missing_note'), function(err) { return []; })
		.catch(error.promise_catch('missing_file'), function(err) { return []; });
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

