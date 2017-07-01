var through = require('through2');
var gutil = require('gulp-util');
var path = require('path');
var isBinaryFile = require('isbinaryfile');
var unirest = require('unirest');
var PluginError = gutil.PluginError;
var blok = {};
var config = {};
var PLUGIN_NAME = 'gulp-blok';
var queue = [];

// Set up blok API information
blok._api = false;
blok._basePath = false;

blok._apiCall = function(method, props, callback) {
  var params = {}

  if (config.options.apiVersion > 1) {
    var req = unirest(method, 'https://api.storyblok.com/v1/spaces/' + config.options.themeId + '/templates/create_or_update');

    params.template = props
    params.token = config.options.apiKey
  } else {
    var req = unirest(method, 'https://' + config.options.url + '/api-v1/theme/' + config.options.themeId);
    var params = props

    req.headers({
      'x-api-key': config.options.apiKey
    });
  }

  req.type('json');
  req.send(params);
  req.end(callback);
}

/*
 * Convert a file path on the local file system to an asset path in blok
 * as you may run gulp at a higher directory locally.
 *
 * @param {string}
 * @return {string}
 */
blok._makeAssetKey = function (filepath, base) {
  filepath = blok._makePathRelative(filepath, base);

  return encodeURI(filepath);
};

/*
 * Get the base path.
 *
 * @return {string}
 */
blok._getBasePath = function (filebase) {
  if (!blok._basePath) {
    var base = filebase;

    blok._basePath = (base.length > 0) ? path.resolve(base) : process.cwd();
  }

  return blok._basePath;
};

/**
 * Sets the base path
 *
 * @param {string} basePath
 * @return {void}
 */
blok._setBasePath = function (basePath) {
  blok._basePath = basePath;
};

/**
 * Make a path relative to base path.
 *
 * @param {string} filepath
 * @return {string}
 */
blok._makePathRelative = function (filepath, base) {
  var basePath = blok._getBasePath(base);

  filepath = path.relative(basePath, filepath);

  return filepath.replace(/\\/g, '/');
};

/**
 * Applies options to plugin
 *
 * @param {object} options
 * @return {void}
 */
blok._setOptions = function (options) {
  if (!options) {
    return;
  }

  if (options.hasOwnProperty('basePath')) {
    blok._setBasePath(options.basePath);
  }

  config.options = options;
};

/*
 * Upload a given file path to blok
 *
 * Some requests may fail if those folders are ignored
 * @param {string} filepath
 * @param {Function} done
 */
blok.upload = function (filepath, file, done) {
  if (queue.indexOf(filepath) > -1) {
    return;
  }

  queue.push(filepath);

  var key = blok._makeAssetKey(filepath, config.options.basePath || 'dist');
  var isBinary = isBinaryFile(filepath);
  var props = {};
  var contents = file.contents;

  if (config.options.apiVersion > 1) {
    props.path = key
  } else {
    props.filepath = key
  }

  if (isBinary) {
    props.attachment = contents.toString('base64');
    props.tmpl_type = 'binary_asset';
  } else {
    props.body = contents.toString();
    props.tmpl_type = 'text';

    var keyParts = key.split('.');
    var lastPart = keyParts[keyParts.length - 1];

    if (['js', 'css', 'svg', 'json'].indexOf(lastPart) > -1) {
      gutil.log(gutil.colors.green('Found js/css/svg/json'));
      props.tmpl_type = 'asset';
    }
  }

  // For backwards compability copy value to type
  props.type = props.tmpl_type

  if (typeof config.options.environment != 'undefined') {
    props.env = config.options.environment
  }

  function onUpdate(res) {
    var index = queue.indexOf(filepath);
    queue.splice(index, 1);

    if (res.error) {
      gutil.log(gutil.colors.red('Error uploading file ' + JSON.stringify(res.error) + (res.body ? JSON.stringify(res.body) : '') ));
    } else if (!res.error) {
      gutil.log(gutil.colors.green('File "' + key + '" uploaded.'));
    }

    done({file: key});
  }

  gutil.log(gutil.colors.green('[gulp-blok] - Starts upload of ' + key));
  blok._apiCall('PUT', props, onUpdate);
};

/*
 * @param {options} object - named array of custom overrides.
 */
function gulpBlokUpload(options) {

  // queue files provided in the stream for deployment
  var apiBurstBucketSize = 10;
  var uploadedFileCount = 0;
  var stream;
  var uploadDoneCb = function() {};
  var uploadDone = function(file) {
    uploadedFileCount--;
    uploadDoneCb(file);
  };

  blok._setOptions(options);

  gutil.log('Ready to upload');

  if (!options.hasOwnProperty('apiKey')) {
    throw new PluginError(PLUGIN_NAME, 'Error, API Key for blok does not exist!');
  }

  if (!options.hasOwnProperty('apiVersion')) {
    options.apiVersion = 1
  }

  if (options.apiVersion != 2) {
    if (!options.hasOwnProperty('url')) {
      throw new PluginError(PLUGIN_NAME, 'Error, url for blok does not exist!');
    }
  }

  if (!options.hasOwnProperty('themeId')) {
    throw new PluginError(PLUGIN_NAME, 'Error, themeId for blok does not exist!');
  }

  if (options.hasOwnProperty('uploadDone')) {
    uploadDoneCb = options['uploadDone'];
  }

  // creating a stream through which each file will pass
  stream = through.obj(function (file, enc, cb) {
    if (file.isStream()) {
      this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
      return cb();
    }

    if (file.isBuffer()) {
      // deploy immediately if within the burst bucket size, otherwise queue
      if (uploadedFileCount <= apiBurstBucketSize) {
        blok.upload(file.path, file, uploadDone);
      } else {
        // Delay deployment based on position in the array to deploy 2 files per second
        // after hitting the initial burst bucket limit size
        setTimeout(function() {
          blok.upload(file.path, file, uploadDone);
        }, ((uploadedFileCount - apiBurstBucketSize) / 2) * 1000);
      }
      uploadedFileCount++;
    }

    // make sure the file goes through the next gulp plugin
    this.push(file);

    // tell the stream engine that we are done with this file
    cb();
  });

  // returning the file stream
  return stream;
}

// exporting the plugin main function
module.exports = gulpBlokUpload;
