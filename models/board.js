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

sync_model.register('board', {
	'add': add,
	'edit': edit,
	'delete': del,
	'move-space': move_space,
	'link': link,
});

/**
 * get a board's data by id
 */
var get_by_id = function(board_id) {
	return db.by_id('boards', board_id)
		.then(function(board) { return board.data; });
};

exports.get_by_space_id = function(space_id) {
	return db.query('SELECT data FROM boards WHERE space_id = {{space_id}}', {space_id: space_id})
		.then(function(boards) {
			return boards.map(function(b) { return b.data; });
		});
};

var add = function(user_id, data) {
	data.user_id = user_id;
	var data = vlad.validate('board', data);
	var space_id = data.space_id;
	return space_model.permissions_check(user_id, space_id, permissions.add_board)
		.then(function(_) {
			return db.insert('boards', {id: data.id, space_id: space_id, data: data});
		})
		.tap(function(board) {
			return space_model.get_space_user_ids(space_id)
				.then(function(user_ids) {
					return sync_model.add_record(user_ids, user_id, 'board', board.id, 'add');
				})
				.then(function(space_ids) {
					board.sync_ids = sync_ids;
				});
		});
};

var edit = function(user_id, data) {
	var data = vlad.validate('board', data);
	return get_by_id(data.id)
		.then(function(board_data) {
			// preserve user_id/space_id
			data.user_id = board_data.user_id;
			data.space_id = board_data.space_id;
			return space_model.permissions_check(user_id, old_space_id, permissions.edit_board)
		})
		.then(function(_) {
			return db.update('boards', data.id, {space_id: space_id, data: data});
		})
		.tap(function(board) {
			return space_model.get_space_user_ids(old_space_id)
				.then(function(user_ids) {
					return sync_model.add_record(user_ids, user_id, 'board', data.id, 'edit');
				})
				.then(function(sync_ids) {
					board.sync_ids = sync_ids;
				});
		});
};

var move_space = function(user_id, data) {
	var data = vlad.validate('board', data);
	return get_by_id(data.id)
		.then(function(board_data) {
			var old_space_id = board_data.space_id;
			var new_space_id = data.space_id;
			// the jackass catcher
			if(old_space_id == new_space_id) {
				throw {skip: true, board: board_data};
			}
			return Promise.all([
				board_data,
				space_model.permissions_check(user_id, old_space_id, permissions.delete_board),
				space_model.permissions_check(user_id, new_space_id, permissions.add_board),
			]);
		})
		.spread(function(board_data) {
			return Promise.all([
				board_data,
				space_model.get_space_user_ids(old_space_id)
					.then(function(user_ids) {
						return sync_model.add_record(user_ids, user_id, 'board', data.id, 'delete');
					}),
				space_model.get_space_user_ids(new_space_id)
					.then(function(user_ids) {
						return sync_model.add_record(user_ids, user_id, 'board', data.id, 'add');
					}),
			]);
		})
		.spread(function(board_data, old_sync_ids, new_sync_ids) {
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

var del = function(user_id, board_id) {
	var space_id = null;
	return get_by_id(board_id)
		.then(function(board_data) {
			space_id = board_data.space_id;
			return space_model.permissions_check(user_id, space_id, permissions.delete_board);
		})
		.then(function() {
			return db.delete('boards', board_id);
		})
		.then(function() {
			return space_model.get_space_user_ids(space_id)
				.then(function(user_ids) {
					return symc_model.add_record(user_ids, user_id, 'board', board_id, 'delete');
				});
		});
};

var link = function(ids) {
	return db.by_ids('boards', ids, {fields: ['data']})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

