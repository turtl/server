var tres = require('../helpers/tres');
var model = require('../models/sync');

exports.route = function(app) {
	app.get('/sync', partial_sync);
	app.get('/sync/full', full_sync);
	app.post('/sync', bulk_sync);
};

/**
 * Given the current user and a sync-id, spits out all data that has changes in
 * the user's profile since that sync id. Used by various clients to stay in
 * sync with the canonical profile (hosted on the server).
 * 
 * Unlike the /sync/full call, this is stateful...we are syncing actual profile
 * changes here and thus depend on syncing the correct data. A mistake here can
 * put bad data into the profile that will sit there until the app clears its
 * local data. So we have to be careful to sync exactly what the client needs.
 * This is easy for tangible things like editing a note or adding a keychain
 * because there is a 1:1 mapping of sync record -> action. When things get
 * tricky is for 'share' and 'unshare' sync records: we have to create a bunch
 * of fake sync records that add the board(s) and their note(s) to the profile
 * and make sure they are injected at the correct place in the sync result.
 * 
 * So in the cases where we're fabricating sync items, we have to be cautious
 * to add/remove the correct data or the app is going to have a bad time.
 */
var partial_sync = function(req, res) {
	const user_id = req.user.id;
	const sync_id = parseInt(req.query.sync_id);
	const type = req.query.type;
	var immediate = req.query.immediate == '1';
	if(type) immediate = (type != 'poll');
	return model.sync_from(user_id, sync_id, !immediate)
		.spread(function(sync_records, latest_sync_id) {
			tres.send(res, {records: sync_records, sync_id: latest_sync_id});
		})
		.catch(tres.err.bind(tres, res));
}

/**
 * Called by the client if a user has no local profile data. Returns the profile
 * data in the same format as a sync call, allowing the client to process it the
 * same way as regular syncing.
 * 
 * It's important to note that this isn't stateful in the sense that we need to
 * gather the correct sync items and send them...what we're doing is pulling out
 * all the needed data for the profile and returning it as sync 'add' items. Any
 * time the app needs a fresh set of *correct* data it can wipe its local data
 * and grab this.
 */
var full_sync = function(req, res) {
	var user_id = req.user.id;
	return tres.wrap(res, model.full_sync(user_id));
};

/**
 * Bulk sync API. Accepts any number of sync items and applies the updates to
 * the profile of the authed user.
 * 
 * Note that the items are added in sequence and if any one in the sequence
 * fails, we abort and send back the successes and failures. This is because
 * many of the items need to be added in a specific sequence in order to work
 * correctly (for instance, a keychain entry for a board needs to be synced
 * before the board itself). Catching a failure in the sequence allows the
 * client to try again whilst still preserving the original order of the sync
 * items.
 */
var bulk_sync = function(req, res) {
	var user_id = req.user.id;
	var client = req.header('X-Turtl-Client');
	var sync_records = req.body;
	return tres.wrap(res, model.bulk_sync(user_id, sync_records, client));
};


