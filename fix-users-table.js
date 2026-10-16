// Retained as a compatibility entry point for the documented repair command.
const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, [require('path').join(__dirname, 'migrate-database.js')], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
