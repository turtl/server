"use strict";

var make_err_fn = function(status) {
	return function(msg, extra) {
		var err = new Error(msg);
		err.status = status;
		err.app_error = true;
		err.extra = extra || false;
		return err;
	};
};

exports.bad_request = make_err_fn(400);
exports.unauthorized = make_err_fn(401);
exports.payment_required = make_err_fn(402);
exports.forbidden = make_err_fn(403);
exports.not_found = make_err_fn(404);
exports.conflict = make_err_fn(409);

exports.internal = make_err_fn(500);

// some utils for skipping over promise chains
exports.promise_throw = function(reason, data) {
	var obj = {};
	obj[reason] = data || true;
	throw obj;
};
exports.promise_catch = function(reason) {
	return function(obj) {
		return typeof(obj[reason]) != 'undefined';
	};
};

