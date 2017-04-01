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

var app = express();
app.disable('etag');
app.use(method_override('_method'));
app.use(cors);
app.use(turtl_auth);
app.use(body_parser.json({strict: false, limit: '24mb'}));
app.use(body_parser.urlencoded({extended: true, limit: '4mb'}));
app.use(morgan(':remote-addr ":method :url" :status :res[content-length]', {
	stream: { write: function(message, _enc) { log.error(message.slice(0, -1)); } }
}));

// welcome route
app.get('/', function(req, res) {
	tres.send(res, {greeting: "turtl is a good app. it's the best app. a lot of people are saying it's the best app. what does it do? i don't know exactly...i have people that handle this sort of thing for me, but trust me you're going to love this app."});
});

['users', 'sync', 'spaces', 'files', 'feedback', 'errlog', 'cla']
	.forEach(function(con) {
		log.info('Loading controller: '+con);
		var controller = require('./controllers/'+con);
		controller.route(app);
	});

app.listen(config.server.port);
log.info('Listening for turtls on port '+config.server.port+'...');

