var through = require('through2'),
  gutil = require('gulp-util'),
  path = require('path'),
  isBinaryFile = require('isbinaryfile'),
  unirest = require('unirest'),
  PluginError = gutil.PluginError,
  blok = {},
  blokApi,
  PLUGIN_NAME = 'gulp-blok';

// Set up blok API information
blok._api = false;
blok._basePath = false;

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
};

/*
 * Upload a given file path to blok
 *
 * Some requests may fail if those folders are ignored
 * @param {string} filepath
 * @param {Function} done
 */
blok.upload = function (filepath, done) {

  var key = blok._makeAssetKey(filepath),
      isBinary = isBinaryFile(filepath),
      props = {
          filepath: key
      },
      contents;

  contents = grunt.file.read(filepath, { encoding: isBinary ? null : 'utf8' });

  if (isBinary) {
      props.attachment = contents.toString('base64');
  } else {
      props.body = contents.toString();

      if (key.indexOf('.js') > -1 || key.indexOf('.css') > -1) {
          blok.notify('Found js/css.');
          props.type = 'asset';
      }
  }

  function onUpdate(res) {
      if (res.error) {
        gutil.log(gutil.colors.red('Error uploading file ' + JSON.stringify(res.body)));
      } else if (!res.error) {
        gutil.log(gutil.colors.green('File "' + key + '" uploaded.'));
      }
      done(res.error);
  }
  
  gutil.log(gutil.colors.green('[gulp-blok] - Starts upload of ' + key));
  blok._apiCall('PUT', props, onUpdate);
};

/*
 * @param {apiKey} string - blok developer api key
 * @param {password} string - blok developer api key password
 * @param {host} string - hostname provided from gulp file
 * @param {themeid} string - unique id upload to the blok theme
 * @param {options} object - named array of custom overrides.
 */
function gulpBlokUpload(apiKey, password, host, themeid, options) {

  // queue files provided in the stream for deployment
  var apiBurstBucketSize = 40,
    uploadedFileCount = 0,
    stream;

  // Set up the API
  blok._setOptions(options);
  blokApi = blok._getApi(apiKey, password, host);

  gutil.log('Ready to upload to ' + gutil.colors.magenta(host));

  if (typeof apiKey === 'undefined') {
    throw new PluginError(PLUGIN_NAME, 'Error, API Key for blok does not exist!');
  }
  if (typeof password === 'undefined') {
    throw new PluginError(PLUGIN_NAME, 'Error, password for blok does not exist!');
  }
  if (typeof host === 'undefined') {
    throw new PluginError(PLUGIN_NAME, 'Error, host for blok does not exist!');
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
        blok.upload(file.path, file, host, '', themeid);
      } else {
        // Delay deployment based on position in the array to deploy 2 files per second
        // after hitting the initial burst bucket limit size
        setTimeout(blok.upload.bind(null, file.path, file, host, '', themeid), ((uploadedFileCount - apiBurstBucketSize) / 2) * 1000);
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
