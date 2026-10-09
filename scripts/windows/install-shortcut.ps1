# Adds "GBPaint" to the Start menu and the desktop (Windows). The shortcuts run scripts/windows/launch.vbs,
# which rebuilds and opens the desktop app from this repo. Run again after moving the repo; remove with -Uninstall.
#   npm run install-shortcut
#   npm run install-shortcut -- -Uninstall
param([switch]$Uninstall)
$ErrorActionPreference = "Stop"

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$name = "GBPaint"
$dataDir = Join-Path $env:LOCALAPPDATA $name
$links = @(
  (Join-Path ([Environment]::GetFolderPath("Programs")) "$name.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "$name.lnk")
)

if ($Uninstall) {
  foreach ($link in $links) { if (Test-Path $link) { Remove-Item $link } }
  if (Test-Path $dataDir) { Remove-Item $dataDir -Recurse }
  Write-Output "Removed the $name shortcuts"
  return
}

# Shortcuts need an .ico: wrap a 256 px PNG of build/icon.png in one (Windows reads PNG-in-ICO).
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $dataDir | Out-Null
$source = [System.Drawing.Image]::FromFile((Join-Path $root "build\icon.png"))
$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.DrawImage($source, 0, 0, 256, 256)
$png = New-Object System.IO.MemoryStream
$bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose(); $source.Dispose()
$bytes = $png.ToArray()
$icon = Join-Path $dataDir "icon.ico"
$writer = New-Object System.IO.BinaryWriter ([System.IO.File]::Create($icon))
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$bytes.Length); $writer.Write([UInt32]22)
$writer.Write($bytes)
$writer.Close()

$shell = New-Object -ComObject WScript.Shell
foreach ($link in $links) {
  $shortcut = $shell.CreateShortcut($link)
  $shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
  $shortcut.Arguments = "`"$(Join-Path $root 'scripts\windows\launch.vbs')`""
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = $icon
  $shortcut.Description = "GBPaint: a pixel painter for GB Studio projects"
  $shortcut.Save()
  Write-Output "Created $link"
}
