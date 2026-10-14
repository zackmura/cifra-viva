# Gera cifra-viva-hostinger.zip só com os arquivos que o site precisa na Hostinger.
# Uso: powershell -ExecutionPolicy Bypass -File empacotar.ps1
# (os caminhos dentro do ZIP usam "/" para o servidor Linux da Hostinger criar as pastas certas)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

node build.js

$files = @(
  'index.html', 'cifra-viva.js', 'icon.svg', 'manifest.webmanifest', 'sw.js', '.htaccess',
  'css/style.css', 'css/site.css',
  'api/index.php', 'api/config.sample.php', 'api/.htaccess'
)

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zipPath = Join-Path $PSScriptRoot 'cifra-viva-hostinger.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($f in $files) {
    $src = Join-Path $PSScriptRoot ($f -replace '/', '\')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $src, $f) | Out-Null
  }
} finally {
  $zip.Dispose()
}
Write-Host "Pronto: $zipPath"
