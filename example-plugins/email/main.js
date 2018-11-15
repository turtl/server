const Promise = require('bluebird');
const nodemailer = require('nodemailer');
const log = require('../../helpers/log');

var config = {};
var transporter = null;

exports.load = function(register, plugin_config) {
	config = plugin_config;
	if(!config.enabled) return;
	if(!config.endpoint) return;
	transporter = nodemailer.createTransport(config.endpoint, config.defaults);
	register({
		send: send,
	});
};

function send(from, to, subject, body) {
	return new Promise(function(resolve, reject) {
		if(!config.enabled) return resolve({email_disabled: true});

		var data = {
			from: from,
			to: to,
			subject: subject,
			text: body,
		};

		transporter.sendMail(data, function(err, res) {
			console.log('ret: ', err, res);
			if(err) return reject(err);
			resolve(res);
		});
	});
};

