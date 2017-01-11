var db = require('../helpers/db');
var sync_model = require('./sync');

sync_model.register('invite', {
	link: link,
	clean: clean,
});

exports.get_by_space_id = function(space_id) {
	return db.query('SELECT data FROM invites WHERE space_id = {{space_id}}', {space_id: space_id})
		.then(function(invites) {
			return invites.map(function(i) { return i.data; });
		});
};

var link = function(ids) {
	return db.by_ids('invites', ids, {fields: ['data']})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

var clean = function(item) {
	delete item.token_server;
	return item;
};

