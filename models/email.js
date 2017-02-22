"use strict";

var Promise = require('bluebird');
var config = require('../helpers/config');
var sendgrid = require('sendgrid')(config.sendgrid.apikey);
var sendgrid_helper = require('sendgrid').mail;
var email_enabled = config.sendgrid.enabled;

exports.send = function(from, to, subject, body) {
	return new Promise(function(resolve, reject) {
		if(!email_enabled) return resolve({email_disabled: true});
		var sg_from = new sendgrid_helper.Email(from);
		var sg_to = new sendgrid_helper.Email(to);
		var sg_body = new sendgrid_helper.Content('text/plain', body);
		var mail = new sendgrid_helper.Mail(sg_from, subject, sg_to, sg_body);
		var request = sendgrid.emptyRequest({
			method: 'POST',
			path: '/v3/mail/send',
			body: mail.toJSON(),
		});
		sendgrid.API(request, function(err, res) {
			if(err) return reject(err);
			resolve(res);
		});
	});
};

