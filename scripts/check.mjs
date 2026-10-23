// Syntax-checks the browser scripts the same way the app loads them.
// Run with: npm run check
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const files = [
  'app.js',
  'online.js',
  'sw.js',
  ...readdirSync('providers').filter((f) => f.endsWith('.js')).map((f) => 'providers/' + f),
];

let failed = false;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log('ok  ' + f);
  } catch (e) {
    failed = true;
    console.error('FAIL ' + f + '\n' + (e.stderr ? e.stderr.toString() : e.message));
  }
}
process.exit(failed ? 1 : 0);
