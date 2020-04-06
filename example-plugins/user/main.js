const Promise = require('bluebird');
const db = require('/app/helpers/db');
const error = require('/app/helpers/error');
const email_model = require('/app/models/email');
const user_model = require('/app/models/user');
const config = require('/app/helpers/config');

exports.load = function(register, plugin_config) {
	register({
		insert: insert,
		confirm_user: confirm_user,
	});
};

/**
 * Here you can build your own logic when a user registers
 * In my case, registration needs to be validated by the admin
 * When implementing the plugin, YOU have to insert the user in the database
 */
function insert(userrecord) {
  // Build the e-mail
	var subject = 'New Registration';
	var body = [
		'Please validate this new account : '+userrecord.username,
		'',
		user_model.get_confirm_url(userrecord),
		'',
		'Thanks!',
		'- Turtl team',
	].join('\n');

	// Insert the inactive user in the database
	userrecord.active = false;
  db.insert('users', userrecord);

	// Send the e-mail to the admin
	email_model.send(config.app.emails.info, config.app.emails.admin, subject, body)
	.catch(function(err) {
		throw error.internal('problem sending confirmation email: '+err.message);
	});

	// Throw an error to prevent the client to login with the inactive account
	// The standard confirm e-mail (See models/user.js > send_confirmation_email) will not be send
	throw error.forbidden('Open Registration is disabled. Your account needs to be validated');
}


/**
 * Here you can build your own logic when the confirmation URL is called
 * You have to keep the logic of the original method user_model.confirm_user
 * In my case,  will activate the user in the database and send him a confirmation e-mail
 * The redirect after the action are keeped untouched (See controllers/users.js > confirm_user)
 */
function confirm_user(email, token) {
	return user_model.get_by_email(email, {raw: true})
		.then(function(user) {
      // Here I skipped all error messages
			// I don't want the usernames to be crawled this way
			if(user) {
				var server_token = user.confirmation_token;
				if(server_token && user_model.secure_compare(token, server_token)) {
					// Send the e-mail
					var subject = 'Turtl - Your account is now active';
					var body = [
				    'Your account is now active. You can use it now.',
						'',
						'Username : '+user.username,
						'',
						'Thanks!',
						'- Turtl team',
					].join('\n');

					email_model.send(config.app.emails.info, user.username, subject, body)
					.catch(function(err) {
						throw error.internal('problem sending confirmation email: '+err.message);
					});

					// Update the user in the database
					return db.update('users', user.id, {confirmed: true, active: true, confirmation_token: null});
				}
			}
			throw error.bad_request('Bad request');
		})
		.then(user_model.clean_user);
}
