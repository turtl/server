"use strict";

var db = require('../helpers/db');
var sync_model = require('./sync');
var space_model = require('./space');
var note_model = require('./note');
var vlad = require('../helpers/validator');
var util = require('../helpers/util');
var Promise = require('bluebird');

vlad.define('board', {
	id: {type: vlad.type.client_id, required: true},
	space_id: {type: vlad.type.client_id, required: true},
	user_id: {type: vlad.type.int, required: true},
	keys: {type: vlad.type.array},
	body: {type: vlad.type.string},
});

/**
 * get a board's data by id
 */
var get_by_id = function(board_id) {
	return db.by_id('boards', board_id)
		.then(function(board) { return board && board.data; });
};

exports.get_by_spaces = function(space_ids) {
	if(space_ids.length == 0) return Promise.resolve([]);
	return db.by_ids('boards', space_ids, {id_field: 'space_id'})
		.then(function(boards) {
			return boards.map(function(b) { return b.data; });
		});
};

exports.get_by_space_id = function(space_id) {
	return exports.get_by_spaces([space_id]);
};

var add = space_model.simple_add(
	'board',
	'boards',
	space_model.permissions.add_board,
	function(data) { return {id: data.id, space_id: data.space_id, data: db.json(data)}; }
);

var edit = space_model.simple_edit(
	'board',
	'boards',
	space_model.permissions.edit_board,
	get_by_id,
	function(data) { return {id: data.id, space_id: data.space_id, data: db.json(data)}; }
);

var del = space_model.simple_delete(
	'board',
	'boards',
	space_model.permissions.delete_board,
	get_by_id
);
exports.delete_board = del;

// NOTE: we don't move the notes in the post_move function because we need to
// re-encrypt the notes once they move to the new space (with the new space's
// key), and that cannot happen server side.
var move_space = space_model.simple_move_space(
	'board',
	'boards',
	space_model.permissions.delete_board,
	space_model.permissions.add_board,
	get_by_id
);

var link = function(ids) {
	return db.by_ids('boards', ids, {fields: ['data']})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

sync_model.register('board', {
	'add': add,
	'edit': edit,
	'delete': del,
	'move-space': move_space,
	'link': link,
});

