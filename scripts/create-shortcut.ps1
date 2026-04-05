# create-shortcut.ps1
# Creates an "Edge (Debug)" desktop shortcut with remote debugging enabled
# and an isolated user data directory.

$ErrorActionPreference = "Stop"

$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path $edgePath)) {
    Write-Error "Microsoft Edge not found. Please install Edge or update the path in this script."
    exit 1
}

$username = $env:USERNAME
$userDataDir = "C:\Users\$username\.edge-debug-profile"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Edge (Debug).lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $edgePath
$shortcut.Arguments = "--remote-debugging-port=9222 --user-data-dir=`"$userDataDir`""
$shortcut.WorkingDirectory = Split-Path $edgePath
$shortcut.IconLocation = "$edgePath,0"
$shortcut.Description = "Microsoft Edge with remote debugging enabled for EdgeControl MCP"
$shortcut.Save()

Write-Host ""
Write-Host "Edge (Debug) shortcut created on your Desktop." -ForegroundColor Green
Write-Host ""
Write-Host "Details:" -ForegroundColor Cyan
Write-Host "  Target:    $edgePath"
Write-Host "  Arguments: --remote-debugging-port=9222 --user-data-dir=`"$userDataDir`""
Write-Host "  Shortcut:  $shortcutPath"
Write-Host ""
Write-Host "Use this shortcut to launch Edge with remote debugging." -ForegroundColor Yellow
Write-Host "Your normal Edge windows are NOT affected." -ForegroundColor Yellow
