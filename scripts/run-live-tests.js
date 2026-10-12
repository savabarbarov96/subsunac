#!/usr/bin/env node
const { spawn } = require('node:child_process');
const local = process.argv.includes('--local');
const child = spawn(process.execPath, ['--test', 'test/live.test.js', 'test/live-downloads.test.js', 'test/providers/subsunacs.test.js', 'test/providers/subsab.test.js'], {
  cwd: require('node:path').join(__dirname, '..'), stdio: 'inherit',
  env: {...process.env, RUN_LIVE_TESTS: '1', SKIP_LIVE_TESTS: '0', ...(local ? {TEST_LOCAL_ADDON: '1', LIVE_URL: 'https://local.addon.test'} : {})}
});
child.on('error', error => {console.error(error.message); process.exitCode = 1;});
child.on('exit', code => {process.exitCode = code ?? 1;});
