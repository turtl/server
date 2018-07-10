"use strict";

/**
 * This file provides a very simple CRUD model for querying and saving data in
 * postgres. note that the upsert function *requires* postgres >= 9.5.
 */

var config = require('./config');
var pg = require('pg');
var Promise = require('bluebird');
var log = require('./log');
var util = require('./util');

// create a connection string TAILORED TO YOUR SPECIFIC NEEDS
if(config.db.connstr) {
	var connection = config.db.connstr;
} else {
	var connection = 'postgres://'+config.db.user+(config.db.password ? ':'+config.db.password : '')+'@'+config.db.host+':'+config.db.port+'/'+config.db.database;
}

/**
 * clean db literal strings
 */
var clean = function(lit) { return lit.replace(/[^0-9a-z_"-]/g, ''); };

/**
 * stringifies data for json storage
 */
exports.json = function(data) {
	if(data === undefined) return null;
	return JSON.stringify(data);
};

/**
 * build a query by replacing templated values inside of it with positional
 * markers that can be handed off to postgres.
 *
 *   SELECT question FROM jokes WHERE punchline = {{punchline}} AND {{where|raw}} OR date < {{now}}
 *   {punchline: 'your mom', where: 'num_uses < 5', now: db.literal('now()')}
 *
 * into
 *
 *   SELECT question FROM jokes WHERE punchline = $1 AND num_uses < 5 OR date < now()
 *   ['your mom']
 *
 * note that there are two ways of specifying literal values...one within the
 * query string itself {{varname|raw}} and one withing the actual query_data,
 * via {varname: db.literal('now()')}
 */
var builder = function(qry, query_data) {
	query_data || (query_data = {});
	var val_arr = [];
	qry = qry.replace(/\{\{([0-9a-z_-]+)(\|raw)?\}\}/gi, function(_, key, raw) {
		var val = (typeof(query_data[key]) == 'undefined' ? '' : query_data[key]);
		// return literal values verbatim
		if(val && val._omg_literally) return val._omg_literally;

		// do some data massaging
		if(val !== null) {
			if(typeof(val) == 'object') val = exports.json(val);
			else val = val.toString();
		}

		// return raw values directly into the query
		if(raw) return val;

		// not literal, not a raw, run the query replacerment and push the val
		// onto our val_arr
		val_arr.push(val);
		return '$'+(val_arr.length);
	});
	return {query: qry, vals: val_arr};
};

// use this to wrap your arguments to be injected as literals. literally.
exports.literal = function(val) { return {_omg_literally: val}; };

var make_client = function(client, release) {
	return {
		query: function(qry, query_data, options) {
			options || (options = {});
			var query_type = options.type;
			var built = builder(qry, query_data);
			var built_qry = built.query;
			var vals = built.vals;

			log.debug('db: query: ', built_qry, vals);
			return new Promise(function(resolve, reject) {
				client.query(built_qry, vals, function(err, result) {
					if(err) return reject(err);
					if((query_type || result.command).toLowerCase() == 'select') {
						resolve(result.rows);
					} else {
						resolve(result);
					}
				});
			});
		},

		close: function() {
			return release();
		}
	};
};

exports.client = function() {
	return new Promise(function(resolve, reject) {
		pg.connect(connection, function(err, client, release) {
			if(err) return reject(err);
			resolve(make_client(client, release));
		});
	});
};

/**
 * run a query, using a pooled connection, and return the result as a finished
 * promise.
 */
exports.query = function(qry, query_data, options) {
	var client = null;
	return exports.client()
		.then(function(_client) {
			client = _client;
			return client.query(qry, query_data, options);
		})
		.finally(function() {
			return client && client.close();
		});
};

/**
 * wraps query(), pulls out the first record
 */
exports.first = function(qry, query_data, options) {
	options || (options = {});
	return exports.query(qry, query_data, options)
		.then(function(res) { return res[0]; });
};

/**
 * get an item by id
 */
exports.by_id = function(table, id, options) {
	options || (options = {});
	var fields = options.fields;

	var qry_fields = fields ? fields.map(clean) : ['*'];
	return exports.first('SELECT '+qry_fields.join(',')+' FROM '+clean(table)+' WHERE id = {{id}} LIMIT 1', {id: id});
};

/**
 * grab items from a table by id
 */
exports.by_ids = function(table, ids, options) {
	options || (options = {});
	var fields = options.fields;
	var id_field = options.id_field || 'id';

	// make sure a blank id list returns a blank result set =]
	if(!ids || ids.length == 0) return Promise.resolve([]);

	var id_data = {};
	var qry_ids = [];
	ids.forEach(function(id, i) {
		id_data['--id-'+i] = id;
		qry_ids.push('{{--id-'+i+'}}')
	});
	var qry_fields = fields ? fields.map(clean) : ['*'];
	return exports.query('SELECT '+qry_fields.join(',')+' FROM '+clean(table)+' WHERE '+clean(id_field)+' IN ( '+qry_ids.join(',')+' )', id_data);
};

/**
 * build a (possibly bulk) insert query, given a data object OR an array of data
 * objects lol
 */
var build_insert = function(table, data) {
	if(!Array.isArray(data)) data = [data];
	else if(data.length == 0) throw new Error('empty data given to db.build_insert');

	var keys = Object.keys(data[0]);
	var qry_keys = keys.map(function(k) { return '"'+clean(k)+'"'; });
	var qry_vals = [];
	data.forEach(function(_, rownum) {
		qry_vals.push('('+keys.map(function(_, i) { return '{{--insert-val-row'+rownum+'-'+i+'}}'; })+')');
	});

	var vals = {};
	data.forEach(function(row, rownum) {
		keys.forEach(function(key, i) {
			vals['--insert-val-row'+rownum+'-'+i] = row[key];
		});
	});
	var qry = 'INSERT INTO '+clean(table)+' ('+qry_keys.join(',')+') VALUES '+qry_vals.join(',');
	return {query: qry, vals: vals};
};

/**
 * insert an object into the given table. if `data` is an array, will do a bulk
 * insert and return ALL inserted data. if `data` is a plain old object, then it
 * just does the one insert and returns just one data object. adaptive. smart.
 * stylish. don't leave home without the insert function in your pocket.
 *
 * to learn more about this operation, see https://youtu.be/AW-iVH9xIEs?t=1m1s
 */
exports.insert = function(table, data) {
	try {
		var built = build_insert(table, data);
	} catch(err) {
		return Promise.reject(err);
	}
	var qry = built.query+' RETURNING '+clean(table)+'.*;';
	return exports.query(qry, built.vals, {type: 'select'})
		.then(function(res) {
			if(Array.isArray(data)) return res;
			else return res[0];
		});
};

/**
 * update an object in a table by id.
 */
exports.update = function(table, id, data) {
	var qry_sets = Object.keys(data).map(function(key) {
		return key+' = {{'+key+'}}';
	});
	qry_sets.push('updated = NOW()');
	var qry = 'UPDATE '+clean(table)+' SET '+qry_sets.join(', ')+' WHERE '+clean('id')+' = {{id}} RETURNING *';
	var copy = util.clone(data);
	copy.id = id;
	return exports.query(qry, copy, {type: 'select'})
		.then(function(res) { return res[0]; });
};

/**
 * does an upsert and returns the latest version of the object (whether inserted
 * or updated). requires postgres >= 9.5.
 *
 * does not support bulk upserts SO EVERYONE STOP FUCKING ASKING ABOUT IT
 */
exports.upsert = function(table, data, key) {
	if(!data[key]) return Promise.reject(new Error('db: upsert: `key` field not present in `data`'));
	if(Array.isArray(data)) return Promise.reject(new Error('db: upsert: `data` cannot be an array.'));

	var keys = Object.keys(data);
	try
	{
		var built = build_insert(table, data);
	}
	catch(err)
	{
		return Promise.reject(err);
	}
	var qry = built.query;
	var vals = built.vals;

	qry += ' ON CONFLICT ('+clean(key)+') ';
	qry += 'DO UPDATE SET ';
	qry += keys.map(function(col, i) {
		var tplvar = '--upsert-var-'+i;
		vals[tplvar] = data[col];
		return col+' = {{'+tplvar+'}}'
	}).join(', ');
	qry += ', updated = NOW()';
	qry += ' RETURNING '+clean(table)+'.*;';

	return exports.query(qry, vals, {type: 'select'})
		.then(function(res) {
			return res[0];
		});
};

/**
 * delete an object by id
 */
exports.delete = function(table, id) {
	return exports.query('DELETE FROM '+clean(table)+' WHERE id = {{id}}', {id: id});
};

