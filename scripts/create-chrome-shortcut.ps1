# create-chrome-shortcut.ps1
# Creates a "Chrome (Debug)" desktop shortcut with remote debugging enabled
# and an isolated user data directory.

$ErrorActionPreference = "Stop"

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chromePath)) {
    Write-Error "Google Chrome not found. Please install Chrome or update the path in this script."
    exit 1
}

$username = $env:USERNAME
$userDataDir = "C:\Users\$username\.chrome-debug-profile"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Chrome (Debug).lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $chromePath
$shortcut.Arguments = "--remote-debugging-port=9222 --user-data-dir=`"$userDataDir`""
$shortcut.WorkingDirectory = Split-Path $chromePath
$shortcut.IconLocation = "$chromePath,0"
$shortcut.Description = "Google Chrome with remote debugging enabled for EdgeControl MCP"
$shortcut.Save()

Write-Host ""
Write-Host "Chrome (Debug) shortcut created on your Desktop." -ForegroundColor Green
Write-Host ""
Write-Host "Details:" -ForegroundColor Cyan
Write-Host "  Target:    $chromePath"
Write-Host "  Arguments: --remote-debugging-port=9222 --user-data-dir=`"$userDataDir`""
Write-Host "  Shortcut:  $shortcutPath"
Write-Host ""
Write-Host "Use this shortcut to launch Chrome with remote debugging." -ForegroundColor Yellow
Write-Host "Your normal Chrome windows are NOT affected." -ForegroundColor Yellow
