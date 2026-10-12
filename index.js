#!/usr/bin/env node
const express = require('express');
const { createApp } = require('./lib/app');

// Export the Express app so Vercel detects and runs the backend entrypoint.
const app = express();
app.use(createApp());
module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 7000;
  app.listen(port, () => {
    console.log(`Bulgarian Subtitles running at ${process.env.PUBLIC_URL || `http://localhost:${port}`}/manifest.json`);
  });
}
