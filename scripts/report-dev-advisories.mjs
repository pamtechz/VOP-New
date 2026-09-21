import { spawnSync } from 'node:child_process';

// Diagnostic only: never run npm audit fix or modify the lockfile on a shared runner.
// Node 24 cannot spawn .cmd scripts directly on Windows; use the command shell.
const windows = process.platform === 'win32';
const result = spawnSync(windows ? (process.env.ComSpec || 'cmd.exe') : 'npm',
  windows ? ['/d', '/s', '/c', 'npm audit --json'] : ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });

if (result.error) throw result.error;
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error('npm audit did not return valid JSON:', result.stderr || result.stdout.slice(0, 500));
  process.exitCode = 1;
}

if (report) {
  const vulnerabilities = report.vulnerabilities ?? {};
  console.log(`Full dependency audit: ${JSON.stringify(report.metadata?.vulnerabilities ?? {})}`);
  for (const [name, item] of Object.entries(vulnerabilities)) {
    const via = (item.via ?? []).map(entry => typeof entry === 'string'
      ? entry
      : `${entry.name} (${entry.title}; ${entry.url})`);
    console.log(JSON.stringify({
      name,
      severity: item.severity,
      range: item.range,
      isDirect: item.isDirect,
      via,
      effects: item.effects,
      fixAvailable: item.fixAvailable,
    }));
  }
  // This step identifies findings; the separate production audit enforces its gate.
  // Network and invocation failures must not be disguised as a clean result.
  if (result.status !== 0 && !Object.keys(vulnerabilities).length) {
    console.error(result.stderr || 'npm audit failed without reporting vulnerabilities.');
    process.exitCode = 1;
  }
}
