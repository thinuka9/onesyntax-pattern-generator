# Serves the project over http://127.0.0.1 for local preview; no Node needed.
# The app must run from a server, not file://, because the logo field reads the brand SVGs back from a canvas.
#   powershell -ExecutionPolicy Bypass -File serve.ps1            # http://127.0.0.1:4174/
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8080
param([string]$Root = $PSScriptRoot, [int]$Port = 4174)

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css'; '.json' = 'application/json'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.md' = 'text/markdown; charset=utf-8'
}
$rootPath = (Resolve-Path $Root).Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $rootPath on http://127.0.0.1:$Port/  (Ctrl+C to stop)"
while ($listener.IsListening) {
  $context = $listener.GetContext()
  # A request the browser drops mid-reply (a reload, a closed tab) must not stop the server.
  try {
    $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
    if ($relative -eq '') { $relative = 'index.html' }
    if ($relative.EndsWith('/')) { $relative += 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $rootPath $relative))
    # Only files inside the project are served.
    if ($file.StartsWith($rootPath, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $type = $types[[IO.Path]::GetExtension($file).ToLowerInvariant()]
      if ($type) { $context.Response.ContentType = $type }
      $context.Response.Headers['Cache-Control'] = 'no-store'
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $context.Response.StatusCode = 404
    }
  } catch {
    Write-Host "Request failed: $($_.Exception.Message)"
  } finally {
    try { $context.Response.Close() } catch {}
  }
}
