"use strict";

var Promise = require('bluebird');
var config = require('../helpers/config');
var mailgun = require('mailgun-js')({apiKey: config.mailgun.key, domain: config.mailgun.domain});
var email_enabled = config.mailgun.enabled;

exports.send = function(from, to, subject, body) {
	var data = {
		from: from,
		to: to,
		subject: subject,
		text: body,
	};
	return new Promise(function(resolve, reject) {
		if(!email_enabled) return resolve({email_disabled: true});
		mailgun.messages().send(data, function(err, body) {
			if(err) return reject(err);
			resolve(body);
		});
	});
};

