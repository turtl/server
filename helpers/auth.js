"use strict";

var user_model = require('../models/user');
var tres = require('./tres');

var public_routes = [
	'get /',
	'post /users',
];

module.exports = function(req, res, next) {
	var auth = req.headers.authorization;
	var method_url = req.method.toLowerCase()+' '+req.url;
	if(public_routes.indexOf(method_url) >= 0) return next();
	return user_model.check_auth(auth)
		.then(function(user) {
			req.user = user;
			next();
		})
		.catch(function(err) {
			tres.err(res, err);
		});
};

