/**
 * Here we have a cli utility for deleting a user
 */

var Promise = require('bluebird');

var uid = (process.argv[2] || '').toString();
if(!uid) {
	console.log('');
	console.log('Usage: '+process.argv[0]+' '+process.argv[1]+' <user_id|email>');
}
var user_model = require('../models/user');

function main() {
	var id_promise = Promise.resolve(uid);
	if(uid.toString().match(/@/)) {
		id_promise = user_model.get_by_email(uid, {raw: true})
			.then(function(user) {
				if(!user) throw new Error('User '+uid+' wasn\'t found.');
				return user.id;
			});
	}
	var user_id;
	return id_promise
		.then(function(_user_id) {
			user_id = _user_id;
			return user_model.delete(user_id, user_id);
		})
		.then(function() {
			console.log('User deleted: '+user_id);
		})
		.catch(function(err) {
			console.log('Error deleting: ', err, err.stack);
		})
		.finally(process.exit);
}

main();

