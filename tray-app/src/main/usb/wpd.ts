/**
 * WpdSource — real phones over USB via Windows Portable Devices, driven
 * through PowerShell + Shell32 COM. No phone app, no drivers to install for
 * Android (MTP is built into Windows); iPhones appear after the one-time
 * "Trust this computer" tap.
 *
 * ⚠ This adapter is intentionally thin and cannot be exercised by CI (it
 * needs physical hardware). All protocol/journal/resume logic lives in
 * UsbTransferEngine, which is fully tested against FolderSource.
 *
 * PowerShell contract: each script prints one JSON document to stdout.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mediaKind } from "../../../../relay/src/sender/library.js";
import type { UsbDevice, UsbFile, UsbSource } from "./source.js";

const execFileAsync = promisify(execFile);

async function ps<T>(script: string, maxBufferMB = 256): Promise<T> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { maxBuffer: maxBufferMB * 1024 * 1024, windowsHide: true }
  );
  const text = stdout.trim();
  return (text ? JSON.parse(text) : null) as T;
}

/** Shell32 folder-item → plain object. Recurses into folders. */
const ENUMERATE_SNIPPET = `
function Enumerate-Folder($folder, $prefix) {
  $items = @()
  foreach ($item in $folder.Items()) {
    $rel = if ($prefix) { "$prefix/$($item.Name)" } else { $item.Name }
    if ($item.IsFolder) {
      $sub = $item.GetFolder
      if ($sub) { $items += Enumerate-Folder $sub $rel }
    } else {
      $items += [PSCustomObject]@{
        relPath = $rel
        name = $item.Name
        size = [int64]($item.ExtendedProperty('System.Size'))
        mtime = [int64]([DateTimeOffset]($item.ModifyDate)).ToUnixTimeSeconds()
      }
    }
  }
  return $items
}
`;

export class WpdSource implements UsbSource {
  async listDevices(): Promise<UsbDevice[]> {
    const script = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject Shell.Application
$devices = @()
foreach ($item in $shell.NameSpace(17).Items()) {
  # Portable devices under "This PC" are folders with no filesystem path.
  if ($item.IsFolder -and -not $item.Path) {
    $devices += [PSCustomObject]@{ id = $item.Name; name = $item.Name }
  }
}
ConvertTo-Json -Compress -InputObject @($devices)
`;
    const list = await ps<Array<{ id: string; name: string }>>(script);
    return Array.isArray(list) ? list : list ? [list] : [];
  }

  async listFiles(deviceId: string): Promise<UsbFile[]> {
    const script = `
$ErrorActionPreference = 'Stop'
${ENUMERATE_SNIPPET}
$shell = New-Object -ComObject Shell.Application
$device = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq '${deviceId.replace(/'/g, "''")}' }
if (-not $device) { throw 'device disconnected' }
$all = @()
foreach ($top in $device.GetFolder.Items()) {
  # Phones expose storage volumes ("Internal shared storage", "SD card").
  if ($top.IsFolder) { $all += Enumerate-Folder $top.GetFolder $top.Name }
}
ConvertTo-Json -Compress -InputObject @($all)
`;
    const raw = await ps<Array<{ relPath: string; name: string; size: number; mtime: number }>>(script);
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
      (f) => f && mediaKind(f.name) && f.size > 0
    );
    // Keep media folders only: DCIM / Pictures / Movies anywhere in the path.
    return list.filter((f) => /(^|\/)(DCIM|Pictures|Movies)(\/|$)/i.test(f.relPath));
  }

  async copyTo(deviceId: string, file: UsbFile, destPath: string): Promise<void> {
    // CopyHere flags: 4 = no progress dialog, 16 = answer "yes to all",
    // 1024 = no error UI. The engine verifies the result by size.
    const destDir = destPath.replace(/[/\\][^/\\]*$/, "");
    const psq = (s: string) => s.replace(/'/g, "''");
    const script = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject Shell.Application
$device = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq '${psq(deviceId)}' }
if (-not $device) { throw 'device disconnected' }
$node = $device.GetFolder
$item = $null
foreach ($part in '${psq(file.relPath)}' -split '/') {
  $item = $node.Items() | Where-Object { $_.Name -eq $part }
  if (-not $item) { throw 'device disconnected' }
  if ($part -ne '${psq(file.name)}') { $node = $item.GetFolder }
}
if (-not $item -or $item.IsFolder) { throw 'file not found on device' }
$dest = $shell.NameSpace('${psq(destDir)}')
$dest.CopyHere($item, 4 -bor 16 -bor 1024)
# CopyHere is asynchronous — wait until the file appears with content.
$target = '${psq(destPath)}'
$deadline = (Get-Date).AddMinutes(10)
while ((Get-Date) -lt $deadline) {
  if ((Test-Path $target) -and (Get-Item $target).Length -gt 0) { break }
  Start-Sleep -Milliseconds 200
}
if (-not (Test-Path $target)) { throw 'copy did not complete' }
[PSCustomObject]@{ ok = $true } | ConvertTo-Json -Compress
`;
    await ps(script);
  }
}
