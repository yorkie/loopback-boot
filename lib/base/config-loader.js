var fs = require('fs');
var path = require('path');
var debug = require('debug')('loopback:boot:config-loader');
var assert = require('assert');

module.exports = ConfigLoader;

function ConfigLoader(options, artifact) {
  this.options = options || {};
  this.artifact = artifact || options.artifact;
}

ConfigLoader.prototype.load = function(rootDir, env) {
  assert(this.artifact, 'Artifact name must to be set');
  return this.loadNamed(rootDir, env, this.artifact);
};

ConfigLoader.prototype.merge = function(target, config, keyPrefix) {
  return this.mergeObjects(target, config, keyPrefix);
};

/**
 * Load named configuration.
 * @param {String} rootDir Directory where to look for files.
 * @param {String} env Environment, usually `process.env.NODE_ENV`
 * @param {String} name
 * @returns {Object}
 */
ConfigLoader.prototype.loadNamed = function(rootDir, env, name) {
  var files = this.findConfigFiles(rootDir, env, name);
  if (files.length) {
    debug('found %s %s files', env, name);
    files.forEach(function(f) {
      debug('  %s', f);
    });
  }
  var configs = this.loadConfigFiles(files);
  var merged = this.mergeConfigurations(configs);

  debug('merged %s %s configuration %j', env, name, merged);

  return merged;
};

/**
 * Search `rootDir` for all files containing configuration for `name`.
 * @param {String} rootDir Root directory
 * @param {String} env Environment, usually `process.env.NODE_ENV`
 * @param {String} name Name
 * @param {Array.<String>} exts An array of extension names
 * @returns {Array.<String>} Array of absolute file paths.
 */
ConfigLoader.prototype.findConfigFiles = function(rootDir, env, name, exts) {
  var master = ifExists(name + '.json');
  if (!master && (ifExistsWithAnyExt(name + '.local') ||
    ifExistsWithAnyExt(name + '.' + env))) {
    console.warn('WARNING: Main config file "' + name + '.json" is missing');
  }
  if (!master) return [];

  var candidates = [
    master,
    ifExistsWithAnyExt(name + '.common'),
    ifExistsWithAnyExt(name + '.local'),
    ifExistsWithAnyExt(name + '.' + env)
  ];

  return candidates.filter(function(c) {
    return c !== undefined;
  });

  function ifExists(fileName) {
    var filePath = path.resolve(rootDir, fileName);
    return fs.existsSync(filePath) ? filePath : undefined;
  }

  function ifExistsWithAnyExt(fileName) {
    var extensions = exts || ['js', 'json'];
    return extensions.some(function(ext) {
      ifExists(fileName + '.' + ext);
    });
  }
};

/**
 * Load configuration files into an array of objects.
 * Attach non-enumerable `_filename` property to each object.
 * @param {Array.<String>} files
 * @returns {Array.<Object>}
 */
ConfigLoader.prototype.loadConfigFiles = function(files) {
  return files.map(function(f) {
    var config = require(f);
    Object.defineProperty(config, '_filename', {
      enumerable: false,
      value: f
    });
    return config;
  });
};

/**
 * Merge multiple configuration objects into a single one.
 * @param {Array.<Object>} configObjects
 */
ConfigLoader.prototype.mergeConfigurations = function(configObjects) {
  var result = configObjects.shift() || {};
  while (configObjects.length) {
    var next = configObjects.shift();
    this.merge(result, next, next._filename);
  }
  return result;
};

ConfigLoader.prototype.mergeObjects = function(target, config, keyPrefix) {
  for (var key in config) {
    var fullKey = keyPrefix ? keyPrefix + '.' + key : key;
    var err = this.mergeSingleItemOrProperty(target, config, key, fullKey);
    if (err) return err;
  }
  return null; // no error
};

ConfigLoader.prototype.mergeNamedItems = function(arr1, arr2, key) {
  assert(Array.isArray(arr1), 'invalid array: ' + arr1);
  assert(Array.isArray(arr2), 'invalid array: ' + arr2);
  key = key || 'name';
  var result = [].concat(arr1);
  for (var i = 0, n = arr2.length; i < n; i++) {
    var item = arr2[i];
    var found = false;
    if (item[key]) {
      for (var j = 0, k = result.length; j < k; j++) {
        if (result[j][key] === item[key]) {
          this.mergeObjects(result[j], item);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      result.push(item);
    }
  }
  return result;
};

ConfigLoader.prototype.mergeObjects = function(target, config, keyPrefix) {
  for (var key in config) {
    var fullKey = keyPrefix ? keyPrefix + '.' + key : key;
    var err = this.mergeSingleItemOrProperty(target, config, key, fullKey);
    if (err) return err;
  }
  return null; // no error
};

ConfigLoader.prototype.mergeSingleItemOrProperty =
  function(target, config, key, fullKey) {
    var origValue = target[key];
    var newValue = config[key];

    if (!hasCompatibleType(origValue, newValue)) {
      return 'Cannot merge values of incompatible types for the option `' +
        fullKey + '`.';
    }

    if (Array.isArray(origValue)) {
      return this.mergeArrays(origValue, newValue, fullKey);
    }

    if (newValue !== null && typeof origValue === 'object') {
      return this.mergeObjects(origValue, newValue, fullKey);
    }

    target[key] = newValue;
    return null; // no error
  }

ConfigLoader.prototype.mergeArrays = function(target, config, keyPrefix) {
  if (target.length !== config.length) {
    return 'Cannot merge array values of different length' +
      ' for the option `' + keyPrefix + '`.';
  }

  // Use for(;;) to iterate over undefined items, for(in) would skip them.
  for (var ix = 0; ix < target.length; ix++) {
    var fullKey = keyPrefix + '[' + ix + ']';
    var err = this.mergeSingleItemOrProperty(target, config, ix, fullKey);
    if (err) return err;
  }

  return null; // no error
}

function hasCompatibleType(origValue, newValue) {
  if (origValue === null || origValue === undefined)
    return true;

  if (Array.isArray(origValue))
    return Array.isArray(newValue);

  if (typeof origValue === 'object')
    return typeof newValue === 'object';

  // Note: typeof Array() is 'object' too,
  // we don't need to explicitly check array types
  return typeof newValue !== 'object';
}
