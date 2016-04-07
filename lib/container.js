var cloneDeep = require('lodash').cloneDeep;
var path = require('path');
var _ = require('lodash');
var debug = require('debug')('loopback:boot:container');

module.exports = function(options) {

};

function Container(options) {
  this.plugins = [];
}

var builtinPlugins = [
  'app', 'datasource', 'mixin', 'model',
  'middleware', 'component', 'script'
];

Container.prototype.use = function(path, handler) {
  var plugin = {
    path: path,
    handler: handler
  };
  this.plugins.push(plugin);
};

Container.prototype.getPlugins = function(path) {
  if (path[path.length - 1] !== '/') {
    path = path + '/';
  }
  return this.plugins.filter(function(p) {
    return p.path.indexOf(path) === 0;
  });
};

Container.prototype.getExtensions = function(path) {
  if (path[path.length - 1] !== '/') {
    path = path + '/';
  }
  return this.plugins.filter(function(p) {
    if (p.path.indexOf(path) === -1) return false;
    var name = p.path.substring(path.length);
    return name && name.indexOf('/') === -1;
  });
};

Container.prototype.run = function(path) {

};

if (require.main === module) {
  var options = {};
  var container = new Container(options);
  options.container = container;
  builtinPlugins.forEach(function(p) {
    var factory = require('./plugins/' + p);
    container.use('/boot/' + p, factory(options));
  });

  var bootPlugins = container.getExtensions('/boot');
  console.log(bootPlugins);
}

/**
 * Gather all bootstrap-related configuration data and compile it into
 * a single object containing instruction for `boot.execute`.
 *
 * @options {String|Object} options Boot options; If String, this is
 * the application root directory; if object, has the properties
 * described in `bootLoopBackApp` options above.
 * @return {Object}
 *
 * @header boot.compile(options)
 */

function compile(options) {
  options = options || {};

  if (typeof options === 'string') {
    options = {appRootDir: options};
  }

  var appRootDir = options.appRootDir = options.appRootDir || process.cwd();
  var env = options.env || process.env.NODE_ENV || 'development';

  var appConfigRootDir = options.appConfigRootDir || appRootDir;
  var appConfig = options.config ||
    ConfigLoader.loadAppConfig(appConfigRootDir, env);
  assertIsValidConfig('app', appConfig);

  var modelsRootDir = options.modelsRootDir || appRootDir;
  var modelsConfig = options.models ||
    ConfigLoader.loadModels(modelsRootDir, env);
  assertIsValidModelConfig(modelsConfig);

  var dsRootDir = options.dsRootDir || appRootDir;
  var dataSourcesConfig = options.dataSources ||
    ConfigLoader.loadDataSources(dsRootDir, env);
  assertIsValidConfig('data source', dataSourcesConfig);

  // not configurable yet
  var middlewareRootDir = appRootDir;

  var middlewareConfig = options.middleware ||
    ConfigLoader.loadMiddleware(middlewareRootDir, env);
  var middlewareInstructions =
    buildMiddlewareInstructions(middlewareRootDir, middlewareConfig);

  var componentRootDir = appRootDir; // not configurable yet
  var componentConfig = options.components ||
    ConfigLoader.loadComponents(componentRootDir, env);
  var componentInstructions =
    buildComponentInstructions(componentRootDir, componentConfig);

  // require directories
  var bootDirs = options.bootDirs || []; // precedence
  bootDirs = bootDirs.concat(path.join(appRootDir, 'boot'));
  resolveRelativePaths(bootDirs, appRootDir);

  var bootScripts = options.bootScripts || [];
  resolveRelativePaths(bootScripts, appRootDir);

  bootDirs.forEach(function(dir) {
    bootScripts = bootScripts.concat(findScripts(dir));
    var envdir = dir + '/' + env;
    bootScripts = bootScripts.concat(findScripts(envdir));
  });

  // de-dedup boot scripts -ERS
  // https://github.com/strongloop/loopback-boot/issues/64
  bootScripts = _.uniq(bootScripts);

  var modelsMeta = modelsConfig._meta || {};
  delete modelsConfig._meta;

  var modelSources = options.modelSources || modelsMeta.sources || ['./models'];
  var modelInstructions = buildAllModelInstructions(
    modelsRootDir, modelsConfig, modelSources, options.modelDefinitions);

  var mixinDirs = options.mixinDirs || [];
  var mixinSources = options.mixinSources || modelsMeta.mixins || ['./mixins'];
  var mixinInstructions = buildAllMixinInstructions(
    appRootDir, mixinDirs, mixinSources, options, modelInstructions);

  // When executor passes the instruction to loopback methods,
  // loopback modifies the data. Since we are loading the data using `require`,
  // such change affects also code that calls `require` for the same file.
  var instructions = {
    env: env,
    config: appConfig,
    dataSources: dataSourcesConfig,
    models: modelInstructions,
    middleware: middlewareInstructions,
    components: componentInstructions,
    mixins: mixinInstructions,
    files: {
      boot: bootScripts
    }
  };

  if (options.appId)
    instructions.appId = options.appId;

  return cloneDeep(instructions);
};