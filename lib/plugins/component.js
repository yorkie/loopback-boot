var util = require('util');
var ConfigLoader = require('../base/config-loader');

var utils = require('../base/utils');

var resolveAppScriptPath = utils.resolveAppScriptPath;

module.exports = function(options) {
  return new Component(options);
};

function Component(options) {
  ConfigLoader.call(this, options, 'component-config');
}

util.inherits(Component, ConfigLoader);

function buildComponentInstructions(rootDir, componentConfig) {
  return Object.keys(componentConfig)
    .filter(function(name) { return !!componentConfig[name]; })
    .map(function(name) {
      return {
        sourceFile: resolveAppScriptPath(rootDir, name, { strict: true }),
        config: componentConfig[name]
      };
    });
}

Component.prototype.build = function(context) {

}