<p align="center">
  <h1 align="center">Storyblok gulp plugin</h1>
  <p align="center">A simple tool for developing <a href="https://www.storyblok.com" target="_blank">Storyblok</a> templates.</p>
</p>

## Installation
```
$ npm install gulp-blok --save-dev
```

## Usage
```
var blok = require('gulp-blok')
var watch = require('gulp-watch')
var config = {
  apiVersion: 2,
  themeId: 'YOUR_SPACE_ID',
  domain: 'YOURSUBDOMAIN.me.storyblok.com',
  apiKey: 'YOUR_TOKEN',
  basePath: 'views',
  environment: 'dev'
}

gulp.task('deploy', function () {
  config.environment = 'live'

  return gulp.src('./views/**/*')
    .pipe(blok(config))
})

gulp.task('default', ['other_tasks'], function () {
  return watch('./views/**/*')
    .pipe(blok(config))
})
```

## What it does
This plugin uses the Storyblok theme api to upload templates and assets when saving and can deploy your project to the live environment.

<br>
<br>
<p align="center">
<img src="https://a.storyblok.com/f/39898/1c9c224705/storyblok_black.svg" alt="Storyblok Logo">
</p>
