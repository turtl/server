exports.send = function(res, data, options) {
	options || (options = {});
	var status = options.status || 200;
	var content = options.content_type || 'application/json';
	res.setHeader('Content-Type', content);
	return res.status(status).send(JSON.stringify(data));
};

exports.err = function(res, err, options) {
	options || (options = {});
	var status = options.status || err.status || 500;
	var content = options.content_type || 'application/json';
	res.setHeader('Content-Type', content);
	var errobj = {
		error: {message: err.message}
	};
	return res.status(status).send(JSON.stringify(errobj));
};

