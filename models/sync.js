var Promise = require('bluebird');
var db = require('../helpers/db');
var error = require('../helpers/error');
var analytics = require('./analytics');
var util = require('../helpers/util');

// holds our sync mappings. models will register themselves to the sync system
// via the `register()` call
var process_sync_map = {};

/**
 * Register a model with the sync system (used mainly for
 * process_incoming_sync())
 */
exports.register = function(type, syncs) {
	process_sync_map[type] = syncs;
};

// -----------------------------------------------------------------------------
// NOTE: i'd normally put this with the other imports at the top, but we *need*
// to define `sync.register()` before loading the space model.
// -----------------------------------------------------------------------------
var space_model = require('./space');

/**
 * Make a sync record.
 */
var make_sync_record = function(user_id, item_type, item_id, action) {
	return {
		user_id: user_id,
		type: item_type,
		item_id: item_id,
		action: action,
	};
};

/**
 * Given an item that can be synced, convert it into a sync record.
 */
var convert_to_sync = function(item, type, action) {
	var sync = make_sync_record(item.user_id, type, item.id, action);
	if(action == 'delete') {
		sync.data = {id: item.id, deleted: true};
	} else {
		sync.data = item;
	}
	return sync;
};

/**
 * inserts a sync record and attaches it to the given space_ids. this is how
 * various clients share data with each other.
 */
exports.add_record = function(affected_user_ids, creator_user_id, type, object_id, action) {
	affected_user_ids = util.dedupe(affected_user_ids);
	var sync_rec = make_sync_record(creator_user_id, type, object_id, action);
	return db.insert('sync', sync_rec)
		.tap(function(sync) {
			return db.insert(affected_user_ids.map(function(user_id) {
				return {sync_id: sync.id, user_id: user_id};
			}));
		})
		.then(function(sync) {
			return [sync_id];
		});
};

/**
 * takes a set of sync records and a set of items (presumably pulled out from
 * said sync records) and matches them together. destructive on sync_records.
 */
var populate_sync_records_with_items = function(sync_records, items) {
	var item_index = {};
	items.forEach(function(item) { item_index[item.id] = item; });
	sync_records.forEach(function(sync) {
		var item = item_index[sync.item_id];
		if(item) {
			sync.data = item.data;
		} else {
			sync.data = {missing: true};
		}
	});
	return sync_records;
};

/**
 * Given a collection of sync records, link in their corresponding data for each
 * item type. For instance, if we have:
 *   {
 *     id: 1234,
 *     item_id: '6969',
 *     type: 'note',
 *     action: 'add'
 *   }
 * when done, we'll have:
 *   {
 *     id: 1234,
 *     item_id: '6969',
 *     type: 'note',
 *     action: 'add'
 *     data: {id: '6969', body: 'abcd==', ...}
 *   }
 * Note that we pulled out the actual note related to this sync record. Wicked.
 */
var link_sync_records = function(sync_records) {
	var mapped = {};
	var deleted = [];
	var present = [];
	// split our sync records between deleted and non-deleted. deleted records
	// require no real processing/linking and can just be shoved in at the end
	// of the entire process (just before sorting everything).
	sync_records.forEach(function(sync) {
		if(sync.action == 'delete') {
			sync.data = {id: sync.item_id, deleted: true};
			deleted.push(sync);
		} else {
			present.push(sync);
		}
	});
	// group our present sync records by sync.type
	present.forEach(function(sync) {
		var type = sync.type;
		if(!mapped[type]) mapped[type] = [];
		mapped[type].push(sync);
	});
	var promises = [];
	Object.keys(mapped).forEach(function(type) {
		if(!process_sync_map[type]) {
			throw error.bad_request('Missing sync handler for type `'+type+'`');
		}
		var sync_type_handler = process_sync_map[type];
		var link = sync_type_handler[type].link;
		if(!link) {
			throw error.bad_request('Missing sync handler for type `'+type+'.link`');
		}
		var sync_records = mapped[type];
		if(sync_records.length == 0) {
			var promise = Promise.resolve([]);
		} else {
			var promise = link(sync_records.map(function(s) { return s.item_id; }))
				.then(function(items) {
					return populate_sync_records_with_items(sync_records, items);
				});
		}
		promises.push(promise);
	});
	return Promise.all(promises)
		.then(function(grouped_syncs) {
			var ungrouped = deleted;
			var latest_sync_id = 0;
			grouped_syncs.forEach(function(sync_records) {
				sync_records.forEach(function(sync) {
					if(sync.id > latest_sync_id) latest_sync_id = sync.id;
					ungrouped.push(sync);
				});
			});
			return [
				ungrouped.sort(function(a, b) { return a.id - b.id; }),
				latest_sync_id,
			];
		});
};

/**
 * Removes any private data from sync records (like invite server tokens, for
 * instance)
 */
var clean_sync_records = function(sync_records) {
	return sync_records.map(function(sync) {
		if(!process_sync_map[sync.type] || !process_sync_map[sync.type].clean) return;
		sync.data = process_sync_map[sync.type].clean(sync.data);
		return sync;
	});
};

/**
 * Given space sync records with action "(un)share", replace the share sync
 * record(s) with full data from that space (boards/notes).
 *
 * note that if a space is unshared, we explicitely send back "delete" sync
 * items for EACH member of the space (boards/notes/invites) individually.
 */
var populate_shares = function(sync_records) {
	var populated = [];
	return Promise.each(sync_records, function(sync) {
		if(sync.type == 'space' && ['share', 'unshare'].indexOf(sync.action) >= 0) {
			// get all boards/notes from this space
			var action = sync.action == 'share' ? 'add' : 'delete';
			return space_model.get_data_tree(sync.item_id)
				.spread(function(space, boards, notes, invites) {
					populated.push(convert_to_sync(space, 'space', action));
					boards.forEach(function(item) {
						var sync = convert_to_sync(item, 'board', action);
						populated.push(sync);
					});
					notes.forEach(function(item) {
						var sync = convert_to_sync(item, 'note', action);
						populated.push(sync);
					});
					invites.forEach(function(item) {
						var sync = convert_to_sync(item, 'invite', action);
						populated.push(sync);
					});
				});
		} else {
			populated.push(sync);
		}
	}).then(function() { return populated; });
};

/**
 * Grab all the sync records for a user id AFTER the given sync id.
 */
exports.sync_from = function(user_id, from_sync_id) {
	var qry = [
		'SELECT',
		'	s.*',
		'FROM',
		'	sync s, sync_users su',
		'WHERE',
		'	s.id = su.sync_id AND',
		'	su.user_id = {{user_id}}',
		'	s.id > {{sync_id}}',
		'ORDER BY',
		'	s.id ASC',
	].join('\n');
	return db.query(qry, {user_id: user_id, sync_id: sync_id})
		.then(function(sync_records) {
			return link_sync_records(sync_records);
		})
		.spread(function(sync_records, latest_sync_id) {
			return populate_shares(sync_records)
				.then(function(sync_records) {
					return clean_sync_records(sync_records);
				})
				.then(function(sync_records) {
					return [
						sync_records,
						latest_sync_id,
					];
				});
		});
};

/**
 * Processes a sync item using the sync handlers that have registered themselves
 * with the sync system. Returns the final item added/edited/deleted/etced.
 */
var process_incoming_sync = function(user_id, sync) {
	var allowed_actions = ['add', 'edit', 'delete'];
	var item = sync.data;
	if(allowed_actions.indexOf(sync.action) < 0) {
		return Promise.reject(error.bad_request('bad sync action (`'+sync.action+'`), must be one of '+allowed_actions.join(', ')));
	}

	if(!process_sync_map[sync.type]) {
		return Promise.reject(error.bad_request('Missing sync handler for type `'+sync.type+'`'));
	}
	var sync_type_handler = process_sync_map[sync.type];
	if(!sync_type_handler[sync.action]) {
		var allowed_actions = Object.keys(sync_type_handler).join(', ');
		return Promise.reject(error.bad_request('Missing sync handler for type `'+sync.type+'.'+sync.action+'` (allowed actions for '+sync.type+': ['+allowed_actions+'])'));
	}
	var handler = sync_type_handler[sync.action];
	if(sync.action == 'delete' && !sync_type_handler.skip_standard_delete) {
		var promise = handler(user_id, item.id);
	} else {
		var promise = handler(user_id, sync.data);
	}
	return promise
		.then(function(item_data) {
			if(sync.action == 'delete' && !sync_type_handler.skip_standard_delete) {
				// return a standard "delete" item (unless the handler says
				// otherwise)
				return {id: sync.data.id, sync_ids: item_data};
			}
			return item_data;
		});
};

/**
 * Given a user_id and a set of incoming sync records, apply the records to the
 * user's profile.
 */
exports.bulk_sync = function(user_id, sync_records) {
	// assign each sync item a unique id so we can track successes vs failures
	sync_records.forEach(function(sync, i) { sync._id = i + 1; });
	var success_idx = {};

	var successes = [];
	var fail_err = null;
	return Promise.each(sync_records, function(sync) {
		return process_incoming_sync(user_id, sync)
			.tap(function(item) {
				var sync_ids = item.sync_ids;
				delete item.sync_ids;
				successes.push({
					type: sync.type,
					action: sync.action,
					sync_ids: sync_ids,
					data: item,
				});
				success_idx[sync._id] = true;
				return analytics.track(user_id, sync.type+'-'+sync.action);
			});
	}).catch(function(err) {
		fail_err = err;
	}).then(function() {
		return {
			// return all successful syncs
			success: successes,
			// return all failed syncs
			failures: sync_records.filter(function(sync) {
				return !success_idx[sync._id];
			}),
			error: fail_err,
		};
	});
};

