#!/usr/bin/env node
const { createApp } = require('./lib/app');
const port = process.env.PORT || 7000;
createApp().listen(port, () => {
  console.log(`Bulgarian Subtitles running at ${process.env.PUBLIC_URL || `http://localhost:${port}`}/manifest.json`);
});
