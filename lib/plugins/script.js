var utils = require('util');
var ConfigLoader = require('../base/config-loader');

module.exports = function(options) {
  return new Script(options);
};

function Script(options) {
  ConfigLoader.call(this, options, 'scripts');
}

utils.inherits(Script, ConfigLoader);