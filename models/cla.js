var db = require('../helpers/db');
var config = require('../helpers/config');
var Promise = require('bluebird');
var error = require('../helpers/error');
var vlad = require('../helpers/validator');
var email_model = require('./email');

vlad.define('cla', {
	type: {type: vlad.type.string, required: true},
	entity: {type: vlad.type.string},
	fullname: {type: vlad.type.string, required: true},
	email: {type: vlad.type.string, required: true},
	address1: {type: vlad.type.string, required: true},
	address2: {type: vlad.type.string},
	city: {type: vlad.type.string, required: true},
	state: {type: vlad.type.string},
	zip: {type: vlad.type.string},
	country: {type: vlad.type.string, required: true},
	github: {type: vlad.type.string, required: true},
	sign: {type: vlad.type.string, required: true},
});

exports.sign = function(sig) {
	if(sig.sign != 'I AGREE') {
		return Promise.reject(error.bad_request('Please type \"I AGREE\" into the signature field.'))
	}
	if(sig.type == 'ecla' && sig.entity == '') {
		return Promise.reject(error.bad_request('Please enter the Company/Organization/Entity name.'));
	}
	try {
		sig = vlad.validate('cla', sig);
	} catch(err) {
		return Promise.reject(err);
	}
	return db.insert('cla', {fullname: sig.fullname, email: sig.email, sigdata: db.json(sig)})
		.then(function() {
			var subject = 'CLA signature';
			var body = [
				'Someone signed the CLA:',
				'',
			].concat(Object.keys(sig).map(function(key) { return key+': '+sig[key]; }));
			return email_model.send('cla@turtlapp.com', config.app.emails.admin, subject, body.join('\n'));
		});
};

