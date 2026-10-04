# Makes the clean copy to hand to the client: the published site exactly as it is served (comments stripped by the
# build, no notes, no history), with a short hosting note, zipped beside this folder. Run it after a push has deployed.
#   powershell -ExecutionPolicy Bypass -File handover.ps1
param(
  [string]$Site = 'https://onesyntax-pattern-generator.pages.dev',
  [string]$Name = 'OneSyntax-Pattern-Generator'
)
$ErrorActionPreference = 'Stop'
$parent = Split-Path $PSScriptRoot -Parent
$folder = Join-Path $parent $Name
$zip = Join-Path $parent "$Name.zip"
if (Test-Path $folder) { Remove-Item $folder -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $folder 'brand') | Out-Null

$files = @('index.html', 'engine.js') + (Get-ChildItem (Join-Path $PSScriptRoot 'brand') -File | ForEach-Object { "brand/$($_.Name)" })
foreach ($file in $files) {
  Invoke-WebRequest -UseBasicParsing -Uri "$Site/$file" -OutFile (Join-Path $folder $file)
}
# The handover must carry no notes: stop if a comment slipped through the build.
$code = (Get-Content (Join-Path $folder 'index.html') -Raw) + (Get-Content (Join-Path $folder 'engine.js') -Raw)
if ($code -match '<!--|/\*\*') { throw 'The deployed site still has comments in it. Check the Cloudflare build, then run this again.' }

@"
OneSyntax Pattern Generator

A static web app: index.html, engine.js and the brand folder. It needs no build and no server code.

To host it, upload these files as they are to any static host (Cloudflare Pages, Netlify, Vercel, an S3 bucket
or a plain web server) and open index.html from there. It must be served over http(s): opening the file straight
from disk stops the Logo Field reading the brand marks.

Video export loads one small library (mp4-muxer) from a public CDN when first used.
"@ | Set-Content -Encoding utf8 (Join-Path $folder 'README.txt')

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $folder '*') -DestinationPath $zip
Write-Host "Handover copy: $zip"
