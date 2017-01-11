var express = require('express');
var morgan = require('morgan');
var body_parser = require('body-parser');
var method_override = require('method-override');
var log = require('./helpers/log');
var tres = require('./helpers/tres');
var turtl_auth = require('./helpers/auth');
var config = require('./helpers/config');
var error = require('./helpers/error');

var app = express();
app.disable('etag');
app.use(method_override('_method'));
app.use(turtl_auth);
app.use(body_parser.json({strict: false, limit: '24mb'}));
app.use(body_parser.urlencoded({extended: false, limit: '24mb'}));
app.use(morgan(':remote-addr ":method :url" :status :res[content-length]', {
	stream: { write: function(message, _enc) { log.info(message.slice(0, -1)); } }
}));
// cors
app.all('*', function(req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept,Origin,User-Agent,DNT,Cache-Control,X-Mx-ReqToken,Keep-Alive,X-Requested-With,If-Modified-Since');
	next();
});

// welcome route
app.get('/', function(req, res) {
	tres.send(res, {greeting: "turtl is a good app. it's the best app. a lot of people, well respected people, are saying it's the best app. what does it do? i don't know exactly...i have people that handle this sort of thing for me, but trust me you're going to love this app.", welcome: true});
});

['users', 'sync', 'spaces', 'files', 'feedback', 'errlog']
	.forEach(function(con) {
		var con = require('./controllers/'+con);
		con.route(app);
	});

// catch all
app.use(function(res, res, next) {
	tres.err(res, error.not_found('resource not found'));
});

app.listen(config.server.port);
log.info('Listening for turtls on port '+config.server.port+'...!');

