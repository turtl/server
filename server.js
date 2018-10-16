"use strict";

const express = require('express');
const morgan = require('morgan');
const body_parser = require('body-parser');
const method_override = require('method-override');
const log = require('./helpers/log');
const tres = require('./helpers/tres');
const cors = require('./helpers/cors');
const turtl_auth = require('./helpers/auth');
const config = require('./helpers/config');
const error = require('./helpers/error');
const fs = require('fs');
const plugins = require('./helpers/plugins');

var app = express();
app.disable('etag');
app.use(method_override('_method'));
app.use(cors);
app.use(body_parser.json({strict: false, limit: '24mb'}));
app.use(body_parser.urlencoded({extended: true, limit: '4mb'}));
app.use(morgan(':remote-addr ":method :url" :status :res[content-length]', {
	stream: { write: function(message, _enc) { log.info(message.slice(0, -1)); } }
}));
app.use(turtl_auth);

// welcome route
app.get('/', function(req, res) {
	tres.send(res, {greeting: "Hi."});
});

['users', 'sync', 'spaces', 'files', 'feedback', 'errlog', 'cla', 'bookmarking', 'health']
	.forEach(function(con) {
		// only load bookmarking controller if we REALLY specify we want it
		if(con == 'bookmarking' && config.app.enable_bookmarker_proxy != 'I UNDERSTAND THIS VIOLATES THE PRIVACY OF MY USERS') {
			return;
		}
		log.info('Loading controller: '+con);
		var controller = require('./controllers/'+con);
		controller.route(app);
	});

try {
	var plugin_dir = config.plugins.plugin_location || './plugins'
	var plugin_list = fs.readdirSync(plugin_dir);
} catch(e) {
	log.info('Problem loading plugins: ', e);
}
plugin_list.forEach(function(plugin) {
	if(plugin[0] == '.') return;
	if(plugin == 'node_modules') return;
	var stats = fs.lstatSync(plugin_dir+'/'+plugin);
	if(!stats.isDirectory()) return;
	log.info('Loading plugin: '+plugin);
	var loader = require(plugin_dir+'/'+plugin+'/main.js');
	var plugin_config = config.plugins[plugin];
	loader.load(plugins.register.bind(plugins, plugin), plugin_config);
});

if (config.server.host) {
	app.listen(config.server.port, config.server.host);
	log.info('Listening for turtls on IP '+config.server.host+', port '+config.server.port+'...');
} else {
	app.listen(config.server.port);
	log.info('Listening for turtls on port '+config.server.port+'...');
}
