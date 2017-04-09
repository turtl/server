"use strict";

var space_mode = require('../models/space');
var invite_model = require('../models/invite');
var tres = require('../helpers/tres');

exports.route = function(app) {
	app.put('/spaces/:space_id/members/:user_id', update_member);
	app.delete('/spaces/:space_id/members/:user_id', delete_member);
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
	tres.wrap(res, space_model.update_member(user_id, space_id, member_user_id, data));
};

var delete_member = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var member_user_id = req.params.user_id;
	tres.wrap(res, space_model.delete_member(user_id, space_id, member_user_id));
};

var send_invite = function(req, res) {
	var from_user_id = req.user.id;
	var data = req.body;
	var to_user = data.to_user;
	var space_id = req.params.space_id;
	tres.wrap(res, invite_model.send(from_user_id, to_user, space_id, data));
};

var update_invite = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var invite_id = req.params.invite_id;
	var data = req.body;
	tres.wrap(res, invite_model.update(user_id, space_id, invite_id, data));
};

var accept_invite = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var invite_id = req.params.invite_id;
	tres.wrap(res, invite_model.accept(user_id, space_id, invite_id));
};

var delete_invite = function(req, res) {
	var user_id = req.user.id;
	var space_id = req.params.space_id;
	var invite_id = req.params.invite_id;
	tres.wrap(res, invite_model.delete(user_id, space_id, invite_id));
};

