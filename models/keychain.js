var db = require('../helpers/db');
var sync_model = require('./sync');

sync_model.register('keychain', {
	add: add,
	edit: edit,
	delete: del,
	link: link,
});

var add = function(user_id, data) {
};

var edit = function(user_id, data) {
};

var del = function(user_id, keychain_id) {
};

var link = function(ids) {
	return db.by_ids('keychain', ids, {fields: ['data']})
		.then(function(items) {
			return items.map(function(i) { return i.data;});
		});
};

