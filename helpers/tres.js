"use strict";

var log = require('./log');

exports.send = function(res, data, options) {
	options || (options = {});
	var status = options.status || 200;
	var content = options.content_type || 'application/json';
	res.setHeader('Content-Type', content);
	return res.status(status).send(options.raw ? data : JSON.stringify(data));
};

exports.redirect = function(res, url, data, options) {
	options || (options = {});
	var status = options.status || 307;
	var content = options.content_type || 'application/json';
	res.setHeader('Content-Type', content);
	res.setHeader('Location', url);
	return res.status(status).send(options.raw ? data : JSON.stringify(data));
};

exports.err = function(res, err, options) {
	options || (options = {});
	err || (err = {});
	var status = options.status || err.status || 500;
	var content = options.content_type || 'application/json';
	res.setHeader('Content-Type', content);
	var errobj = {
		error: {message: err.message}
	};
	var uid = null;
	try { uid = res.req.user.id; } catch(_) {}
	log.error('tres.err -- (uid '+uid+'):', status == 500 ? err : err.message);
	return res.status(status).send(JSON.stringify(errobj));
};

exports.wrap = function(res, promise, options) {
	return promise
		.then(function(data) {
			return exports.send(res, data, options);
		})
		.catch(function(err) {
			return exports.err(res, err, options);
		});
};

