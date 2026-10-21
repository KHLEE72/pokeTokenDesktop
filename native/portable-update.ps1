param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$directory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ConfigPath))
$statusPath = Join-Path $directory 'status.json'
$staged = $null
$backup = $null
$replaced = $false
$launched = $null
function Status([string]$value) {
  $temporary = Join-Path $directory 'status.tmp'
  [IO.File]::WriteAllText($temporary, (@{status=$value} | ConvertTo-Json -Compress))
  Move-Item -LiteralPath $temporary -Destination $statusPath -Force
}
function Launch-App([string]$argument) {
  $arguments = @($argument)
  if ($config.testPort -and [int]$config.testPort -ge 1024 -and [int]$config.testPort -le 65535) { $arguments += "--remote-debugging-port=$($config.testPort)" }
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $config.target
  $start.Arguments = $arguments -join ' '
  $start.WorkingDirectory = [IO.Path]::GetDirectoryName($config.target)
  $start.UseShellExecute = $true
  $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  return [Diagnostics.Process]::Start($start)
}
try {
  $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($config.token -notmatch '^[a-f0-9-]{36}$' -or $config.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid config' }
  $target = [IO.Path]::GetFullPath($config.target)
  $source = [IO.Path]::GetFullPath($config.source)
  if (-not $target.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase) -or $source -ne (Join-Path $directory 'download.exe') -or $target -eq $source) { throw 'Invalid paths' }
  $staged = "$target.update-$($config.token).tmp"
  $backup = "$target.backup-$($config.token)"
  $failed = "$target.failed-$($config.token)"
  if ([IO.File]::Exists($staged) -or [IO.File]::Exists($backup) -or [IO.File]::Exists($failed)) { throw 'Existing update files' }
  $parent = [Diagnostics.Process]::GetProcessById([int]$config.parentPid)
  Status 'preparing'
  Copy-Item -LiteralPath $source -Destination $staged
  # Get-FileHash is an auto-loaded script function and may be absent when an
  # Electron app inherits PowerShell 7's PSModulePath. Use .NET directly.
  $hashAlgorithm = [Security.Cryptography.SHA256]::Create()
  $hashStream = [IO.File]::OpenRead($staged)
  try { $digest = [BitConverter]::ToString($hashAlgorithm.ComputeHash($hashStream)).Replace('-', '').ToLowerInvariant() }
  finally { $hashStream.Dispose(); $hashAlgorithm.Dispose() }
  if ($digest -ne $config.sha256) { throw 'Checksum mismatch' }
  if (Test-Path -LiteralPath (Join-Path $directory 'cancel')) { throw 'Cancelled' }
  Status 'ready'
  if (-not $parent.WaitForExit(120000)) { throw 'App did not exit' }
  # NSIS's portable launcher outlives Electron while it removes its extraction.
  # Retry atomic replacement until that exact EXE is unlocked; never kill it.
  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  do {
    if (Test-Path -LiteralPath (Join-Path $directory 'cancel')) { throw 'Cancelled' }
    try { [IO.File]::Replace($staged, $target, $backup); $replaced = $true; break }
    catch { if ([DateTime]::UtcNow -ge $deadline) { throw }; Start-Sleep -Milliseconds 250 }
  } while ($true)
  Status 'starting'
  $launched = Launch-App "--poketoken-update=$($config.token)"
  $healthy = Join-Path $directory 'healthy'
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  do {
    if ((Test-Path -LiteralPath $healthy) -and [IO.File]::ReadAllText($healthy) -eq $config.token) {
      $replaced = $false
      Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $source -Force -ErrorAction SilentlyContinue
      Status 'complete'
      exit 0
    }
    if ($launched.HasExited -or [DateTime]::UtcNow -ge $deadline) { throw 'New app did not become healthy' }
    Start-Sleep -Milliseconds 250
  } while ($true)
} catch {
  $failure = $_.Exception.GetType().Name + ': ' + $_.Exception.Message
  try { [IO.File]::AppendAllText((Join-Path $directory 'helper.log'), $failure + [Environment]::NewLine) } catch { }
  if ($replaced) {
    # Do not kill processes or overwrite a live new app. Retain its backup if
    # Windows still locks it, so the original binary remains recoverable.
    try {
      # PowerShell converts $null to an empty String for this overload. Give
      # Replace a concrete quarantine path rather than losing the rollback.
      [IO.File]::Replace($backup, $target, $failed)
      Remove-Item -LiteralPath $failed -Force -ErrorAction SilentlyContinue
      Status 'rolled-back'
      $null = Launch-App "--poketoken-update-recovery=$($config.token)"
    } catch { Status 'recovery-required' }
  } elseif ($parent -and $parent.HasExited -and [IO.File]::Exists($target) -and -not (Test-Path -LiteralPath (Join-Path $directory 'cancel'))) {
    try { Status 'rolled-back'; $null = Launch-App "--poketoken-update-recovery=$($config.token)" }
    catch { Status 'recovery-required' }
  } else { Status 'failed' }
} finally {
  if ($staged -and [IO.File]::Exists($staged)) { Remove-Item -LiteralPath $staged -Force -ErrorAction SilentlyContinue }
}
