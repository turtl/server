"use strict";

var email_model = require('./email');
var error = require('../helpers/error');
var config = require('../helpers/config');
var analytics = require('./analytics');

exports.send = function(user_id, username, client, data) {
	var body = data.body || false;
	if(!body) return Promise.reject(error.bad_request('no feedback given'));
	var subject = 'New Turtl feedback from '+username+' ('+user_id+')';
	var email_body = [
		'You have received feedback from '+username+' (user id '+user_id+', client '+client+'):',
		'',
		'************',
		'',
		body,
	];
	return email_model.send(username, config.app.emails.admin, subject, email_body.join('\n'))
		.then(function() {
			analytics.track(user_id, 'feedback.send', {client: client});
			return true;
		})
		.catch(function(err) {
			throw error.internal('problem sending confirmation email: '+err.message);
		});
};

