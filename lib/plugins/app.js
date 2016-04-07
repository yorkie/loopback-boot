var utils = require('util');
var ConfigLoader = require('../base/config-loader');

module.exports = function(options) {
  return new App(options);
};

function App(options) {
  ConfigLoader.call(this, options, 'config');
}

utils.inherits(App, ConfigLoader);