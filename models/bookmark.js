var Promise = require('bluebird');
var request = require('request');

exports.proxy_url = function(url) {
	return new Promise(function(resolve, reject) {
		request({uri: url, method: 'get'}, function(err, res) {
			if(err) return reject(err);
			resolve(res);
		});
	});
};

