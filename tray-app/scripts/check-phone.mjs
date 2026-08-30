import { execFileSync } from 'node:child_process';

const psExe = process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const ps = (cmd) => execFileSync(psExe, ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' });

try {
  console.log('--- Shell "This PC" portable devices (namespace 17) ---');
  const out = ps(`(New-Object -ComObject Shell.Application).Namespace(17).Items() | ForEach-Object { $_.Name }`);
  console.log(out || '(none)');
} catch (e) {
  console.log('shell enum failed:', e.message);
}
try {
  console.log('--- WPD PnP devices ---');
  console.log(ps(`Get-PnpDevice -Class WPD -ErrorAction SilentlyContinue | Select-Object FriendlyName, Status | Format-Table -AutoSize | Out-String`));
} catch (e) {
  console.log('pnp failed:', e.message);
}
