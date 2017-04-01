var model = require('../models/cla');
var tres = require('../helpers/tres');
var config = require('../helpers/config');

exports.route = function(app) {
	app.post('/cla/sign', sign);
};

var sign = function(req, res) {
	var redirect = req.body['redirect'] || config.app.www_url+'/contributing/sign-thanks';
	var redirect_err = req.body['redirect-err'] || config.app.www_url+'/contributing/sign-error';
	var fields = [
		'type', 'entity', 'fullname',
		'email', 'address1', 'address2',
		'city', 'state', 'zip',
		'country', 'phone', 'github',
		'sign',
	];
	var sig = {};
	fields.forEach(function(field) { sig[field] = req.body[field]; });
	model.sign(sig)
		.then(function() {
			tres.redirect(res, redirect, 'yay', {status: 302});
		})
		.catch(function(err) {
			tres.redirect(res, redirect_err, 'There was an error processing your signature.', {status: 302});
		});
};

