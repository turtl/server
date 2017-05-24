"use strict";

var space_model = require('../models/space');
var invite_model = require('../models/invite');
var tres = require('../helpers/tres');
var analytics = require('../models/analytics');

exports.route = function(app) {
	app.put('/spaces/:space_id/members/:user_id', update_member);
	app.delete('/spaces/:space_id/members/:user_id', delete_member);
	app.put('/spaces/:space_id/owner/:new_user_id', set_owner);
	app.post('/spaces/:space_id/invites', send_invite);
	app.put('/spaces/:space_id/invites/:invite_id', update_invite);
	app.post('/spaces/:space_id/invites/accepted/:invite_id', accept_invite);
	app.delete('/spaces/:space_id/invites/:invite_id', delete_invite);
};

var update_member = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var member_user_id = req.params.user_id;
	var data = req.body;
	var client = req.header('X-Turtl-Client');
	var promise = space_model.update_member(user_id, space_id, member_user_id, data)
		.tap(function() {
			analytics.track(user_id, 'space.update-member', client, {
				space_id: space_id,
				member_id: member_user_id,
				role: data.role,
			});
		});
	tres.wrap(res, promise);
};

var delete_member = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var member_user_id = req.params.user_id;
	var client = req.header('X-Turtl-Client');
	var promise = space_model.delete_member(user_id, space_id, member_user_id)
		.tap(function() {
			analytics.track(user_id, 'space.delete-member', client, {
				space_id: space_id,
				member_id: member_user_id,
			});
		});
	tres.wrap(res, promise);
};

var set_owner = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var new_user_id = req.params.new_user_id;
	var client = req.header('X-Turtl-Client');
	var promise = space_model.set_owner(user_id, space_id, new_user_id)
		.tap(function() {
			analytics.track(user_id, 'space.set-owner', client, {
				space_id: space_id,
				member_id: new_user_id,
			});
		});
	tres.wrap(res, promise);
};

var send_invite = function(req, res) {
	var from_user_id = req.user.id;
	var data = req.body;
	var space_id = req.params.space_id;
	var client = req.header('X-Turtl-Client');
	var promise = invite_model.send(from_user_id, space_id, data)
		.tap(function() {
			analytics.track(from_user_id, 'space.invite-send', client, {
				space_id: space_id,
				from: from_user_id,
				to: data.to_user,
				role: data.role,
				has_password: data.has_password,
			});
		});
	tres.wrap(res, promise);
};

var update_invite = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var invite_id = req.params.invite_id;
	var data = req.body;
	var client = req.header('X-Turtl-Client');
	var promise = invite_model.update(user_id, space_id, invite_id, data)
		.tap(function() {
			analytics.track(user_id, 'space.update-invite', client, {
				space_id: space_id,
				role: data.role,
			});
		});
	tres.wrap(res, promise);
};

var accept_invite = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var invite_id = req.params.invite_id;
	var client = req.header('X-Turtl-Client');
	var promise = invite_model.accept(user_id, space_id, invite_id, function(invite) {
		analytics.track(user_id, 'space.invite-accept', client, {
			space_id: space_id,
			from: invite.from_user_id,
			to: invite.to_user,
			role: invite.data.role,
			is_passphrase_protected: invite.data.is_passphrase_protected,
		});
	});
	tres.wrap(res, promise);
};

var delete_invite = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var invite_id = req.params.invite_id;
	var client = req.header('X-Turtl-Client');
	var promise = invite_model.delete(user_id, space_id, invite_id, function(meta) {
		var action = meta.is_invitee ? 'space.invite-decline' : 'space.invite-delete';
		analytics.track(user_id, action, client, {space_id: space_id});
	});
	tres.wrap(res, promise);
};

