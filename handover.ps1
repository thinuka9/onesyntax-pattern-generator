# Makes the clean copy to hand to the client: the published site exactly as it is served (comments stripped by the
# build, no notes, no history), with a short hosting note, zipped beside this folder. Run it after a push has deployed.
#   powershell -ExecutionPolicy Bypass -File handover.ps1
param(
  [string]$Site = 'https://onesyntax-pattern-generator.pages.dev',
  [string]$Name = 'OneSyntax-Pattern-Generator'
)
$ErrorActionPreference = 'Stop'
$parent = Split-Path $PSScriptRoot -Parent
# The files are gathered in a temporary folder and only the zip is left beside the repository.
$folder = Join-Path ([IO.Path]::GetTempPath()) $Name
$zip = Join-Path $parent "$Name.zip"
if (Test-Path $folder) { Remove-Item $folder -Recurse -Force }
New-Item -ItemType Directory -Force $folder | Out-Null

# The page, the engine, and every file in brand/ and vendor/ (fonts, libraries and their licences).
$local = { param($dir) Get-ChildItem (Join-Path $PSScriptRoot $dir) -File -Recurse | ForEach-Object { $_.FullName.Substring($PSScriptRoot.Length + 1).Replace('\', '/') } }
$files = @('index.html', 'engine.js') + (& $local 'brand') + (& $local 'vendor')
foreach ($file in $files) {
  # Cloudflare answers /index.html with a 308 to /, which Windows PowerShell does not follow: ask for / directly.
  $path = if ($file -eq 'index.html') { '' } else { $file }
  $target = Join-Path $folder $file
  New-Item -ItemType Directory -Force (Split-Path $target -Parent) | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri "$Site/$path" -OutFile $target
}
# The handover must carry no notes: stop if a comment slipped through the build.
$code = (Get-Content (Join-Path $folder 'index.html') -Raw) + (Get-Content (Join-Path $folder 'engine.js') -Raw)
if ($code -match '<!--|/\*\*') { throw 'The deployed site still has comments in it. Check the Cloudflare build, then run this again.' }

@"
OneSyntax Pattern Generator

A static web app: index.html, engine.js and the brand and vendor folders. It needs no build, no server code and
no internet connection: the Geist fonts and the libraries it uses are in the vendor folder, with their licences.

To host it, upload these files as they are to any static host (Cloudflare Pages, Netlify, Vercel, an S3 bucket
or a plain web server) and open index.html from there. It must be served over http(s): opening the file straight
from disk stops the Logo Field reading the brand marks.
"@ | Set-Content -Encoding utf8 (Join-Path $folder 'README.txt')

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $folder '*') -DestinationPath $zip
Remove-Item $folder -Recurse -Force
Write-Host "Handover copy: $zip"
