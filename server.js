"use strict";

var express = require('express');
var morgan = require('morgan');
var body_parser = require('body-parser');
var method_override = require('method-override');
var log = require('./helpers/log');
var tres = require('./helpers/tres');
var cors = require('./helpers/cors');
var turtl_auth = require('./helpers/auth');
var config = require('./helpers/config');
var error = require('./helpers/error');
var fs = require('fs');
var plugins = require('./helpers/plugins');

var app = express();
app.disable('etag');
app.use(method_override('_method'));
app.use(cors);
app.use(turtl_auth);
app.use(body_parser.json({strict: false, limit: '24mb'}));
app.use(body_parser.urlencoded({extended: true, limit: '4mb'}));
app.use(morgan(':remote-addr ":method :url" :status :res[content-length]', {
	stream: { write: function(message, _enc) { log.info(message.slice(0, -1)); } }
}));

// welcome route
app.get('/', function(req, res) {
	tres.send(res, {greeting: "тremendous notes. everyone says so."});
});

['users', 'sync', 'spaces', 'files', 'feedback', 'errlog', 'cla', 'bookmarking']
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

app.listen(config.server.port);
log.info('Listening for turtls on port '+config.server.port+'...');

