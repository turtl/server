var allowed_headers = [
	'Authorization',
	'Content-Type',
	'Accept',
	'Origin',
	'User-Agent',
	'DNT',
	'Cache-Control',
	'X-Mx-ReqToken',
	'Keep-Alive',
	'X-Requested-With',
	'If-Modified-Since',
	'X-Turtl-Client',
].join(',');

module.exports = function(req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
	res.header('Access-Control-Allow-Headers', allowed_headers);
	next();
};

