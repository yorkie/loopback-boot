var util = require('util');
var path = require('path');
var toposort = require('toposort');

var ConfigLoader = require('../base/config-loader');
var utils = require('../base/utils');

var resolveAppScriptPath = utils.resolveAppScriptPath;

module.exports = function(options) {
  return new Middleware(options);
};

function Middleware(options) {
  ConfigLoader.call(this, options, 'middleware');
}

util.inherits(Middleware, ConfigLoader);

Middleware.prototype.merge = function(target, config, fileName) {
  var err;
  for (var phase in config) {
    if (phase in target) {
      err = mergePhaseConfig(target[phase], config[phase], phase);
    } else {
      err = 'The phase "' + phase + '" is not defined in the main config.';
    }
    if (err)
      throw new Error('Cannot apply ' + fileName + ': ' + err);
  }
};

function mergePhaseConfig(target, config, phase) {
  var err;
  for (var mw in config) {
    if (mw in target) {
      var targetMiddleware = target[mw];
      var configMiddleware = config[mw];
      if (Array.isArray(targetMiddleware) && Array.isArray(configMiddleware)) {
        // Both are arrays, combine them
        target[mw] = this.mergeNamedItems(targetMiddleware, configMiddleware);
      } else if (Array.isArray(targetMiddleware)) {
        if (typeof configMiddleware === 'object' &&
          Object.keys(configMiddleware).length) {
          // Config side is an non-empty object
          target[mw] = this.mergeNamedItems(targetMiddleware, [configMiddleware]);
        }
      } else if (Array.isArray(configMiddleware)) {
        if (typeof targetMiddleware === 'object' &&
          Object.keys(targetMiddleware).length) {
          // Target side is an non-empty object
          target[mw] = this.mergeNamedItems([targetMiddleware], configMiddleware);
        } else {
          // Target side is empty
          target[mw] = configMiddleware;
        }
      } else {
        err = this.mergeObjects(targetMiddleware, configMiddleware);
      }
    } else {
      err = 'The middleware "' + mw + '" in phase "' + phase + '"' +
        'is not defined in the main config.';
    }
    if (err) return err;
  }
}


function buildMiddlewareInstructions(rootDir, config) {
  var phasesNames = Object.keys(config);
  var middlewareList = [];
  phasesNames.forEach(function(phase) {
    var phaseConfig = config[phase];
    Object.keys(phaseConfig).forEach(function(middleware) {
      var allConfigs = phaseConfig[middleware];
      if (!Array.isArray(allConfigs))
        allConfigs = [allConfigs];

      allConfigs.forEach(function(config) {
        var resolved = resolveMiddlewarePath(rootDir, middleware, config);

        // resolved.sourceFile will be false-y if an optional middleware
        // is not resolvable.
        // if a non-optional middleware is not resolvable, it will throw
        // at resolveAppPath() and not reach here
        if (!resolved.sourceFile) {
          return console.log('Middleware "%s" not found: %s',
            middleware,
            resolved.optional
          );
        }

        var middlewareConfig = cloneDeep(config);
        middlewareConfig.phase = phase;

        if (middlewareConfig.params) {
          middlewareConfig.params = resolveMiddlewareParams(
            rootDir, middlewareConfig.params);
        }

        var item = {
          sourceFile: resolved.sourceFile,
          config: middlewareConfig
        };
        if (resolved.fragment) {
          item.fragment = resolved.fragment;
        }
        middlewareList.push(item);
      });
    });
  });

  var flattenedPhaseNames = phasesNames
    .map(function getBaseName(name) {
      return name.replace(/:[^:]+$/, '');
    })
    .filter(function differsFromPreviousItem(value, ix, source) {
      // Skip duplicate entries. That happens when
      // `name:before` and `name:after` are both translated to `name`
      return ix === 0 || value !== source[ix - 1];
    });

  return {
    phases: flattenedPhaseNames,
    middleware: middlewareList
  };
}

function resolveMiddlewarePath(rootDir, middleware, config) {
  var resolved = {
    optional: !!config.optional
  };

  var segments = middleware.split('#');
  var pathName = segments[0];
  var fragment = segments[1];
  var middlewarePath = pathName;
  var opts = {
    strict: true,
    optional: !!config.optional
  };

  if (fragment) {
    resolved.fragment = fragment;
  }

  if (pathName.indexOf('./') === 0 || pathName.indexOf('../') === 0) {
    // Relative path
    pathName = path.resolve(rootDir, pathName);
  }

  var resolveOpts = _.extend(opts, {
    // Workaround for strong-agent to allow probes to detect that
    // strong-express-middleware was loaded: exclude the path to the
    // module main file from the source file path.
    // For example, return
    //   node_modules/strong-express-metrics
    // instead of
    //   node_modules/strong-express-metrics/index.js
    fullResolve: false
  });
  var sourceFile = resolveAppScriptPath(rootDir, middlewarePath, resolveOpts);

  if (!fragment) {
    resolved.sourceFile = sourceFile;
    return resolved;
  }

  // Try to require the module and check if <module>.<fragment> is a valid
  // function
  var m = require(pathName);
  if (typeof m[fragment] === 'function') {
    resolved.sourceFile = sourceFile;
    return resolved;
  }

  /*
   * module/server/middleware/fragment
   * module/middleware/fragment
   */
  var candidates = [
    pathName + '/server/middleware/' + fragment,
    pathName + '/middleware/' + fragment,
    // TODO: [rfeng] Should we support the following flavors?
    // pathName + '/lib/' + fragment,
    // pathName + '/' + fragment
  ];

  var err;
  for (var ix in candidates) {
    try {
      resolved.sourceFile = resolveAppScriptPath(rootDir, candidates[ix], opts);
      delete resolved.fragment;
      return resolved;
    }
    catch (e) {
      // Report the error for the first candidate when no candidate matches
      if (!err) err = e;
    }
  }
  throw err;
}

// Match values starting with `$!./` or `$!../`
var MIDDLEWARE_PATH_PARAM_REGEX = /^\$!(\.\/|\.\.\/)/;

function resolveMiddlewareParams(rootDir, params) {
  return cloneDeep(params, function resolvePathParam(value) {
    if (typeof value === 'string' && MIDDLEWARE_PATH_PARAM_REGEX.test(value)) {
      return path.resolve(rootDir, value.slice(2));
    } else {
      return undefined; // no change
    }
  });
}

Middleware.prototype.load = function(context) {
}

Middleware.prototype.compile = function(context) {
}

Middleware.prototype.resolve = function(context) {
}

Middleware.prototype.init = function(context) {
}

Middleware.prototype.start = function(context) {
}

Middleware.prototype.stop = function(context) {
}

Middleware.prototype.destroy = function(context) {
}