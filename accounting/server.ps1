# =========================================================================
#  경리 콕핏 — 윈도우 내장 PowerShell 정적 서버 (Node.js 불필요)
#  폴더 연결(File System Access API)은 localhost 에서만 되므로 이 서버로 띄웁니다.
# =========================================================================
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$root = $PSScriptRoot
$rootFull = [System.IO.Path]::GetFullPath($root)

$mime = @{
  ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8";
  ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".svg"="image/svg+xml"; ".png"="image/png"; ".jpg"="image/jpeg"; ".ico"="image/x-icon";
  ".woff2"="font/woff2"; ".woff"="font/woff"; ".map"="application/json";
  ".xlsx"="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

# 사용 가능한 포트 탐색
$listener = $null; $port = 0
foreach ($p in 4173..4183) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $port = $p; break }
  catch { try { $l.Close() } catch {} }
}
if ($null -eq $listener) {
  Write-Host ""
  Write-Host "  서버를 시작할 수 없습니다 (포트 4173~4183 사용 중)."
  Read-Host "  엔터를 누르면 닫힙니다"
  exit 1
}

$url = "http://localhost:$port/"
Write-Host ""
Write-Host "  경리 콕핏 실행 중  ->  $url"
Write-Host "  (이 검은 창을 닫으면 종료됩니다)"
Write-Host ""
try { Start-Process $url } catch {}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch { break }
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($rel -eq "/" -or $rel -eq "") { $rel = "/index.html" }
    $file = Join-Path $root ($rel.TrimStart("/") -replace "/", "\")
    $full = [System.IO.Path]::GetFullPath($file)
    if (-not $full.StartsWith($rootFull)) {
      $res.StatusCode = 403
    } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
      $res.ContentType = $ct
      $res.Headers.Add("Cache-Control", "no-cache")
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes("404: $rel")
      $res.OutputStream.Write($b, 0, $b.Length)
    }
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}
