"use strict";

var Promise = require('bluebird');
var db = require('../helpers/db');
var error = require('../helpers/error');
var analytics = require('./analytics');
var util = require('../helpers/util');
var log = require('../helpers/log');
var config = require('../helpers/config');

// holds our sync mappings. models will register themselves to the sync system
// via the `register()` call
var process_sync_map = {};

/**
 * Register a model with the sync system (used mainly for
 * process_incoming_sync())
 */
exports.register = function(type, syncs) {
	log.debug('register sync: '+type+': ['+Object.keys(syncs).join(', ')+']');
	process_sync_map[type] = syncs;
};

// -----------------------------------------------------------------------------
// NOTE: i'd normally put these with the other imports at the top, but we *need*
// to define `sync.register()` before loading the models.
// -----------------------------------------------------------------------------
var user_model = require('./user');
var keychain_model = require('./keychain');
var space_model = require('./space');
var board_model = require('./board');
var note_model = require('./note');
var invite_model = require('./invite');

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
	var user_id = item.user_id;
	if(!user_id && type == 'invite') user_id = item.from_user_id;
	var sync = make_sync_record(user_id, type, item.id, action);
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
	// if this affects no users, then it's useless, but not worth derailing the
	// sync process. return a blank array.
	if(affected_user_ids.length == 0) return Promise.resolve([]);

	affected_user_ids = util.dedupe(affected_user_ids);
	var sync_rec = make_sync_record(creator_user_id, type, object_id, action);
	return db.insert('sync', sync_rec)
		.tap(function(sync) {
			return db.insert('sync_users', affected_user_ids.map(function(user_id) {
				return {sync_id: sync.id, user_id: user_id};
			}));
		})
		.then(function(sync) {
			return [sync.id];
		});
};

/**
 * Given a set of old and new user ids, find all users that are the same and
 * return same, old, new (all unique from each other).
 *
 * This is useful when you WOULD be tempted to do a delete-on-old/add-on-new
 * double-sync, but some of your users would want a edit-on-same for a less
 * jarring experience in the client.
 */
exports.split_same_users = function(old_user_ids, new_user_ids) {
	var in_both = [];
	old_user_ids.forEach(function(old_user_id) {
		if(new_user_ids.indexOf(old_user_id) >= 0) {
			in_both.push(old_user_id);
		}
	});
	old_user_ids = old_user_ids.filter(function(id) { return in_both.indexOf(id) < 0; });
	new_user_ids = new_user_ids.filter(function(id) { return in_both.indexOf(id) < 0; });
	return {
		old: old_user_ids,
		new: new_user_ids,
		same: in_both,
	};
};

/**
 * Add sync records from a split returned from split_same_users
 */
exports.add_records_from_split = function(user_id, split_obj, action_map, sync_type, item_id) {
	var promises = [];
	var push_sync = function(user_ids, action) {
		promises.push(exports.add_record(user_ids, user_id, sync_type, item_id, action));
	};
	['same', 'old', 'new'].forEach(function(split_type) {
		push_sync(split_obj[split_type], action_map[split_type]);
	});
	return Promise.all(promises);
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
			sync.data = item;
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
		var link = sync_type_handler.link;
		if(!link) {
			throw error.bad_request('Missing sync handler for type `'+type+'.link`');
		}
		var sync_records = mapped[type];
		var promise = Promise.resolve([]);
		if(sync_records.length > 0) {
			promise = link(sync_records.map(function(s) { return s.item_id; }))
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
			ungrouped.forEach(function(sync) {
				if(sync.id > latest_sync_id) latest_sync_id = sync.id;
			});
			return [
				ungrouped.sort(function(a, b) { return a.id - b.id; }),
				latest_sync_id > 0 ? latest_sync_id : null,
			];
		});
};

/**
 * Removes any private data from sync records (like invite server tokens, for
 * instance)
 */
var clean_sync_records = function(sync_records) {
	return sync_records.map(function(sync) {
		if(!process_sync_map[sync.type] || !process_sync_map[sync.type].clean) return sync;
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
var populate_shares = function(user_id, sync_records) {
	var populated = [];
	return Promise.each(sync_records, function(sync) {
		if(sync.type == 'space' && ['share', 'unshare'].indexOf(sync.action) >= 0) {
			// get all boards/notes from this space
			var action = sync.action == 'share' ? 'add' : 'delete';
			return space_model.user_has_permission(user_id, sync.item_id, space_model.permissions.add_space_invite)
				.then(function(has_perm) {
					return space_model.get_data_tree(sync.item_id, {skip_invites: !has_perm});
				})
				.spread(function(space, boards, notes) {
					// make sure the space actually exists before creating our
					// sync records. otherwise, we just pass through the
					// original sync record, but with our add/delete action
					// (and we'll have {missing: true} for our `data` tee hee)
					if(space) {
						populated.push(convert_to_sync(space, 'space', action));
						boards.forEach(function(item) {
							var sync = convert_to_sync(item, 'board', action);
							populated.push(sync);
						});
						notes.forEach(function(item) {
							var sync = convert_to_sync(item, 'note', action);
							populated.push(sync);
						});
					} else {
						// ah ah! alex, remember what we talked about? mmhmm
						// thank you. shutup. thank you.
						sync.action = action;
						populated.push(sync);
					}
				});
		} else {
			populated.push(sync);
		}
	}).then(function() { return populated; });
};

var poll_sync_items = function(user_id, from_sync_id, poll, cutoff) {
	var qry = [
		'SELECT',
		'	s.*',
		'FROM',
		'	sync s, sync_users su',
		'WHERE',
		'	s.id = su.sync_id AND',
		'	su.user_id = {{user_id}} AND',
		'	s.id > {{sync_id}}',
		'ORDER BY',
		'	s.id ASC',
	].join('\n');
	return db.query(qry, {user_id: user_id, sync_id: from_sync_id})
		.then(function(sync_records) {
			var now = new Date().getTime();
			if(sync_records.length > 0 || !poll || (poll && now > cutoff)) {
				// if we're polling (normal use), then when a sync comes in,
				// there's a great chance we're going to return the first part
				// of the sync before the entire thing finishes, which means the
				// client won't have access to all the sync_ids that were
				// created BEFORE the incoming sync triggers. race condition,
				// really. so what we do is delay arbitrarily to give whatever
				// triggered the incoming sync time to finish.
				if(poll) {
					return util.delay(500, sync_records);
				} else {
					return sync_records;
				}
			}
			return util.delay(2500)
				.then(function() {
					return poll_sync_items(user_id, from_sync_id, poll, cutoff);
				});
		});
};

/**
 * Grab all the sync records for a user id AFTER the given sync id.
 */
exports.sync_from = function(user_id, from_sync_id, poll) {
	if(!from_sync_id && from_sync_id !== 0) {
		return Promise.reject(error.bad_request('missing `sync_id` var: '+JSON.stringify(from_sync_id)));
	}
	var cutoff = (new Date().getTime()) + (1000 * 30);
	return poll_sync_items(user_id, from_sync_id, poll, cutoff)
		.then(function(sync_records) {
			return link_sync_records(sync_records);
		})
		.spread(function(sync_records, latest_sync_id) {
			return populate_shares(user_id, sync_records)
				.then(function(sync_records) {
					return clean_sync_records(sync_records);
				})
				.then(function(sync_records) {
					return [
						sync_records,
						latest_sync_id || from_sync_id,
					];
				});
		});
};

/**
 * Processes a sync item using the sync handlers that have registered themselves
 * with the sync system. Returns the final item added/edited/deleted/etced.
 */
var process_incoming_sync = function(user_id, sync) {
	var item = sync.data;
	if(!process_sync_map[sync.type]) {
		return Promise.reject(error.bad_request('Missing sync handler for type `'+sync.type+'`'));
	}
	var sync_type_handler = process_sync_map[sync.type];
	if(!sync_type_handler[sync.action]) {
		var allowed_actions = Object.keys(sync_type_handler).join(', ');
		return Promise.reject(error.bad_request('Missing sync handler for type `'+sync.type+'.'+sync.action+'` (allowed actions for '+sync.type+': ['+allowed_actions+'])'));
	}
	var handler = sync_type_handler[sync.action];
	var handler_data = null;
	if(sync.action == 'delete' && !sync_type_handler.skip_standard_delete) {
		handler_data = item.id;
	} else {
		handler_data = sync.data;
	}
	try {
		var promise = handler(user_id, handler_data);
	} catch(err) {
		return Promise.reject(err);
	}
	return promise
		.then(function(item_data) {
			if(sync.action == 'delete' && !sync_type_handler.skip_standard_delete) {
				// return a standard "delete" item (unless the handler says
				// otherwise)
				return {id: sync.data.id, sync_ids: item_data};
			}
			// NOTE: since our sync handlers are expected to return the full
			// db record, and we really only want to return the object's `data`,
			// here we grab the data and set in our sync_ids
			var data = item_data.data;
			if(!data.id && item_data.id) data.id = item_data.id;
			data.sync_ids = item_data.sync_ids;
			return item_data.data;
		});
};

/**
 * Given a user_id and a set of incoming sync records, apply the records to the
 * user's profile.
 */
exports.bulk_sync = function(user_id, sync_records, client) {
	// enforce our sync.max_bulk_sync_records config
	var max_sync_records = (config.sync || {}).max_bulk_sync_records;
	if(max_sync_records) {
		sync_records = sync_records.slice(0, max_sync_records);
	}
	var breakdown = {};
	sync_records.forEach(function(sync) {
		var key = sync.type+'.'+sync.action;
		if(!breakdown[key]) breakdown[key] = 0;
		breakdown[key]++;
	});
	log.info('sync.bulk_sync() -- user '+user_id+': syncing '+sync_records.length+' items: ', breakdown);

	// assign each sync item a unique id so we can track successes vs failures
	sync_records.forEach(function(sync, i) { sync._id = i + 1; });
	var success_idx = {};

	var successes = [];
	return Promise.each(sync_records, function(sync) {
		var sync_client_id = sync.id;
		log.debug('sync.bulk_sync() -- sync item start: ', sync_client_id, sync.action, sync.type);
		return process_incoming_sync(user_id, sync)
			.tap(function(item) {
				log.debug('sync.bulk_sync() -- sync item done: ', sync_client_id);
				var sync_ids = item.sync_ids;
				delete item.sync_ids;
				successes.push({
					id: sync_client_id,
					user_id: user_id,
					item_id: item.id,
					type: sync.type,
					action: sync.action,
					sync_ids: sync_ids,
					data: item,
				});
				success_idx[sync._id] = true;
				// DON'T return, we don't want failed analytics to grind the
				// sync to a halt
				analytics.track(user_id, sync.type+'.'+sync.action, client);
			})
			.catch(function(err) {
				log.error('sync.bulk_sync() -- ', err);
				// store the errmsg in the sync item itself, which will be
				// returned to the client.
				sync.error = {code: err.status || 500, msg: err.message};
			});
	}).then(function() {
		log.debug('sync.bulk_sync() -- sync complete');
		return {
			// return all successful syncs
			success: successes,
			// return all failed syncs
			failures: sync_records.filter(function(sync) {
				return !success_idx[sync._id] && sync.error;
			}),
			// return all syncs that cannot continue because they are blocked by
			// a failure (remember, syncs process one after the other...if one
			// fails, the rest of the chain cannot continue)
			blocked: sync_records.filter(function(sync) {
				return !success_idx[sync._id] && !sync.error;
			}),
		};
	});
};

/**
 * Grab all a user's profile data, in the form of sync records.
 */
exports.full_sync = function(user_id) {
	var user;
	var sync_records = [];
	var space_ids = [];
	return user_model.get_by_id(user_id, {data: true})
		.then(function(_user) {
			user = _user;
			user.user_id = user_id;
			sync_records.push(convert_to_sync(user, 'user', 'add'));
			delete user.user_id;
			return keychain_model.get_by_user(user_id);
		})
		.then(function(keychain) {
			keychain.forEach(function(entry) {
				sync_records.push(convert_to_sync(entry, 'keychain', 'add'));
			});
			return space_model.get_by_user_id(user_id);
		})
		.then(function(spaces) {
			return Promise.all(spaces.map(function(space) {
				space_ids.push(space.id);
				return space_model.user_has_permission(user_id, space.id, space_model.permissions.add_space_invite)
					.then(function(has_perm) {
						if(!has_perm) delete space.data.invites;
						// spaces return the top-level object, not space.data, so we
						// have to dig in to create the sync item.
						sync_records.push(convert_to_sync(space.data, 'space', 'add'));
					});
			}));
		})
		.then(function(spaces) {
			return board_model.get_by_spaces(space_ids);
		})
		.then(function(boards) {
			boards.forEach(function(board) {
				sync_records.push(convert_to_sync(board, 'board', 'add'));
			});
			return note_model.get_by_spaces(space_ids);
		})
		.then(function(notes) {
			notes.forEach(function(note) {
				sync_records.push(convert_to_sync(note, 'note', 'add'));
			});
			notes.forEach(function(note) {
				if(!note.has_file) return;
				sync_records.push(convert_to_sync(note, 'file', 'add'));
			});
			return invite_model.get_by_to_email(user.username);
		})
		.then(function(invites) {
			invites.forEach(function(invite) {
				sync_records.push(convert_to_sync(invite, 'invite', 'add'));
			});
			return db.first('SELECT MAX(id) AS sync_id FROM sync')
				.then(function(rec) { return rec.sync_id; });
		})
		.then(function(sync_id) {
			return {
				sync_id: sync_id || 0,
				records: sync_records.map(function(s) {s.id = 0; return s;}),
			};
		});
};

