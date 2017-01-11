var yaml = require('js-yaml');
var fs = require('fs');

var config_str = fs.readFileSync(__dirname+'/../config/config.yaml', 'utf8');
module.exports = yaml.safeLoad(config_str);

