var winston = require('winston');
var config = require('./config');

winston.exitOnError = false;
winston.level = config.loglevel;
module.exports = winston;

