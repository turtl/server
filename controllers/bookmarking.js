var model = require('../models/bookmark');
var tres = require('../helpers/tres');
var config = require('../helpers/config');
var log = require('../helpers/log');

exports.route = function(app) {
	app.get('/bookmark', proxy_url);
};

var proxy_url = function(req, res) {
	var url = req.query.url;
	tres.wrap(res, model.proxy_url(url));
};

