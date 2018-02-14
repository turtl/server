"use strict";

const yaml_env = require('yaml-env');
module.exports = yaml_env.load('TURTL', __dirname+'/../config/config.yaml');

