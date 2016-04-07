var utils = require('util');
var ConfigLoader = require('../base/config-loader');

module.exports = function(options) {
  return new DataSource(options);
};

function DataSource(options) {
  ConfigLoader.call(this, options, 'datasources');
}

utils.inherits(DataSource, ConfigLoader);