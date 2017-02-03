var Promise = require('bluebird');
var db = require('../helpers/db');
var log = require('../helpers/log');

// create a user and supporting data we can log in using:
//   curl -H 'Authorization: Basic YW5kcmV3QGx5b25icm9zLmNvbTpnZXRham9i' ...

function main() {
	var user_id = 1;
	var space_id = '60692bb';
	var note_id = 'ababab';
	var promises = [
		db.insert('users', {id: user_id, username: 'andrew@lyonbros.com', auth: 'Abb7pie35wabgaNNOvHL/+E6EjOZbLKDAhwCC6mU3PIkEiJeR+/vbjvLaXFZ1AL0OA61PdokNOFPJz/CboA1HX6UJpaVHqFURUPPQs7kj1JKZQGvQAhTGoyteWz3/qrfeG3nyf95eA6U5294+2fGOFJqua5JB7aIXQbMRtVAuwk=', confirmed: true, data: db.json({name: 'andrew lyon'}), storage_mb: 100}),
		db.insert('spaces', {id: space_id, data: db.json({id: space_id, user_id: user_id})}),
		db.insert('spaces_users', {space_id: space_id, user_id: user_id, role: 'owner'}),
		db.insert('notes', {id: note_id, space_id: space_id, data: db.json({id: note_id, space_id: space_id, user_id: user_id, has_file: false})}),
	];
	return Promise.all(promises)
		.then(function() {
			console.log('- sensitive sh*t created (don\'t blow a gasket, osborne)');
		})
		.catch(function(err) {
			log.error('error creating data: ', err);
		})
		.finally(process.exit);
}

main();

