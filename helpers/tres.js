"use strict";

var log = require('./log');

exports.send = function(res, data, options) {
	options || (options = {});
	var status = options.status || 200;
	var content = options.content_type || 'application/json';
	res.setHeader('Content-Type', content);
	return res.status(status).send(JSON.stringify(data));
};

exports.redirect = function(res, url, data, options) {
	options || (options = {});
	var status = options.status || 307;
	var content = options.content_type || 'application/json';
	res.setHeader('Content-Type', content);
	res.setHeader('Location', url);
	return res.status(status).send(JSON.stringify(data));
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
	log.error('tres.err -- ', err);
	return res.status(status).send(JSON.stringify(errobj));
};

exports.wrap = function(res, promise) {
	return promise
		.then(exports.send.bind(exports, res))
		.catch(exports.err.bind(exports, res));
};

