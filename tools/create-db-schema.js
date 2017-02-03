/**
 * This file defines (and creates) our database schema.
 *
 * NOTE: we make liberal use of the text type because in postgres there's no
 * difference between varchar and text under the hood, but varchar can be
 * excessively limiting and hard to change later on.
 */

var db = require('../helpers/db');
var config = require('../helpers/config');
var Promise = require('bluebird');

var schema_version = 1;

var run_upgrade = function(from_version, to_version) {
	// TODO? or just get it right the first time...
};

var schema = [];
var builder = {
	type: {
		pk_int: 'serial primary key',
		pk: 'varchar(96) primary key',
		id_int: 'integer',
		id: 'varchar(96)',
		int: 'integer',
		json: 'jsonb',
		date: 'timestamp',
		varchar: function(chars) { return 'varchar('+chars+')'; },
		text: 'text',
		bool: 'boolean',
		smallint: 'smallint',
	},
	not_null: function(type) { return type+' not null'; },

	table: function(table_name, options) {
		var fields = options.fields;
		var indexes = options.indexes;

		fields.created = builder.type.date+' default CURRENT_TIMESTAMP';
		fields.updated = builder.type.date+' default CURRENT_TIMESTAMP';
		schema.push([
			'create table if not exists '+table_name+' (',
			Object.keys(fields).map(function(name) { return name+' '+fields[name]; }),
			')',
		].join(' '));
		if(indexes && indexes.length) {
			indexes.forEach(function(index) {
				var name = index.name || index.fields.join('_');
				schema.push([
					'create index if not exists '+table_name+'_'+name+' on '+table_name+' (',
					index.fields.join(','),
					')',
				].join(' '));
			});
		}
	},
};

var ty = builder.type;

builder.table('app', {
	fields: {
		id: ty.pk,
		val: ty.text,
	},
});

builder.table('boards', {
	fields: {
		id: ty.pk,
		space_id: ty.id,
		data: ty.json,
	},
	indexes: [
		{name: 'space_id', fields: ['space_id']}
	],
});

builder.table('spaces_invites', {
	fields: {
		id: ty.pk,
		space_id: ty.id,
		from_user_id: ty.id_int,
		to_user: ty.text,
		data: ty.json,
	},
	indexes: [
		{name: 'from_user_id', fields: ['from_user_id']},
		{name: 'to_user', fields: ['to_user']},
	],
});

builder.table('keychain', {
	fields: {
		id: ty.pk,
		user_id: ty.id_int,
		data: ty.json,
	},
	indexes: [
		{name: 'user_id', fields: ['user_id']},
	],
});

builder.table('notes', {
	fields: {
		id: ty.pk,
		space_id: ty.id,
		data: ty.json
	},
	indexes: [
		{name: 'space_id', fields: ['space_id']}
	],
});

builder.table('spaces', {
	fields: {
		id: ty.pk,
		data: ty.json,
	},
});

builder.table('spaces_users', {
	fields: {
		id: ty.pk_int,
		space_id: ty.id,
		user_id: ty.id_int,
		role: ty.varchar(24),
	},
	indexes: [
		{name: 'user_id', fields: ['user_id']},
	],
});

builder.table('sync', {
	fields: {
		id: ty.pk_int,
		item_id: ty.id,
		type: ty.text,
		action: ty.varchar(32),
		user_id: ty.id_int,
	},
});

builder.table('sync_users', {
	fields: {
		id: ty.pk_int,
		sync_id: ty.id_int,
		user_id: ty.id,
	},
	indexes: [
		{name: 'user_id', fields: ['user_id']},
	],
});

builder.table('users', {
	fields: {
		id: ty.pk_int,
		username: builder.not_null(ty.text),
		auth: ty.text,
		confirmed: ty.bool,
		data: ty.json,
		storage_mb: ty.int,
	},
	indexes: [
		// NOTE: no `auth` index...pull out by username, do double-hmac compare
		// on auth
		{name: 'username', fields: ['username'], unique: true},
	],
});

function run()
{
	console.log('- running DB schema');
	return Promise.each(schema, function(qry) { return db.query(qry); })
		.then(function() {
			return db.by_id('app', 'schema-version');
		})
		.then(function(schema_ver) {
			if(!schema_ver) {
				// no record? just insert it with the current version.
				return db.insert('app', {id: 'schema-version', val: schema_version});
			} else if(parseInt(schema_ver.val) < schema_version) {
				// run an upgrayyyyd
				var from = parseInt(schema_ver.val);
				var to = schema_version;
				return run_upgrade(from, to);
			}
		})
		.then(function() { console.log('- done'); })
		.catch(function(err) { console.error(err, err.stack); })
		.finally(function() { setTimeout(process.exit, 100); });
}

run();

