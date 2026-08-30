import { execFileSync } from 'node:child_process';
const psExe = process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const script = `
$shell = New-Object -ComObject Shell.Application
foreach ($item in $shell.NameSpace(17).Items()) {
  [PSCustomObject]@{ name = $item.Name; isFolder = $item.IsFolder; path = [string]$item.Path; type = [string]$item.Type }
}
`;
const enc = Buffer.from(script, 'utf16le').toString('base64');
const out = execFileSync(psExe, ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',enc], {encoding:'utf8'});
console.log(out);
