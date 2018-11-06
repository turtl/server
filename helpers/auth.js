"use strict";

var user_model = require('../models/user');
var tres = require('./tres');

function add_public_route(routespec) {
	public_routes.push(new RegExp('^'+routespec+'$'));
};
exports.add_public_route = add_public_route;

var public_routes = [];
[
	'get /',
	'post /users',
	'get /users/confirm/[^/]+/[a-f0-9]+',
	'post /cla/sign',
	'get /health/[a-z0-9]+',
].map(add_public_route);

exports.verify = function(req, res, next) {
	if(req.method == 'OPTIONS') return next();
	var auth = req.headers.authorization;
	// see if we have a public route
	var method_url = req.method.toLowerCase()+' '+req.url;
	for(var i = 0, n = public_routes.length; i < n; i++) {
		var pub = public_routes[i];
		if(pub.test(method_url)) return next();
	}
	return user_model.check_auth(auth)
		.then(function(user) {
			req.user = user;
			next();
		})
		.catch(function(err) {
			tres.err(res, err);
		});
};

