/**
 * Here we have a cli utility for deleting a user
 */

var Promise = require('bluebird');

var note_id = (process.argv[2] || '').toString();
if(!note_id) {
	console.log('');
	console.log('Usage: '+process.argv[0]+' '+process.argv[1]+' <noteid>');
}
const note_model = require('../models/note');

function main() {
	return note_model.get_by_id(note_id)
		.then(function(note) {
			if(!note) {
				console.log('that note doesn\'t exist');
				return;
			}
			var user_id = note.user_id;
			return note_model.delete_note(user_id, note_id)
				.then(function() {
					console.log('Note deleted: '+note_id);
				});
		})
		.catch(function(err) {
			console.log('Error deleting: ', err, err.stack);
		})
		.finally(process.exit);
}

main();

