"use strict";

var db = require('../helpers/db');
var sync_model = require('./sync');
var space_model = require('./space');
var vlad = require('../helpers/validator');

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
		.then(function(board) { return board.data; });
};

exports.get_by_spaces = function(space_ids) {
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

var move_space = function(user_id, data) {
	var data = vlad.validate('board', data);
	var board_id = data.id;
	return get_by_id(board_id)
		.then(function(board_data) {
			var old_space_id = board_data.space_id;
			var new_space_id = data.space_id;
			// the jackass catcher
			if(old_space_id == new_space_id) {
				throw {skip: true, board: board_data};
			}
			return Promise.all([
				board_data,
				new_space_id,
				space_model.permissions_check(user_id, old_space_id, permissions.delete_board),
				space_model.permissions_check(user_id, new_space_id, permissions.add_board),
			]);
		})
		.spread(function(board_data, new_space_id) {
			board_data.space_id = new_space_id;
			var update = {
				space_id: new_space_id,
				data: board_data,
			};
			return Promise.all([
				db.update('boards', board_id, update),
				space_model.get_space_user_ids(old_space_id)
					.then(function(user_ids) {
						return sync_model.add_record(user_ids, user_id, 'board', board_id, 'delete');
					}),
				space_model.get_space_user_ids(new_space_id)
					.then(function(user_ids) {
						return sync_model.add_record(user_ids, user_id, 'board', board_id, 'add');
					}),
			]);
		})
		.spread(function(board, old_sync_ids, new_sync_ids) {
			var board_data = board.data;
			var sync_ids = old_sync_ids.concat(new_sync_ids);
			board_data.sync_ids = sync_ids;
			return board_data;
		})
		.catch(function(err) { return err.skip === true; }, function(err) {
			var board = err.board;
			board.sync_ids = [];
			return board;
		});
};

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

