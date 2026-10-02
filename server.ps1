# BlueTalk Lightweight Native HTTP Server
$port = 8080
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*"}).IPAddress | Select-Object -First 1

$httpListener = New-Object System.Net.HttpListener
$httpListener.Prefixes.Add("http://+:$port/")

try {
    $httpListener.Start()
} catch {
    # If wildcard binding requires admin, fall back to localhost
    $httpListener = New-Object System.Net.HttpListener
    $httpListener.Prefixes.Add("http://localhost:$port/")
    $httpListener.Start()
}

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  BLUETALK PRO - LIVE WEB SERVER IS RUNNING" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [PC]     On Laptop / PC:    http://localhost:$port" -ForegroundColor Yellow
Write-Host "  [Mobile] On Mobile Phone:   http://${localIP}:$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "  (Ensure your phone and laptop are connected to the same Wi-Fi)" -ForegroundColor DarkGray
Write-Host "  Press Ctrl+C in this window to stop the server." -ForegroundColor DarkGray
Write-Host "=======================================================" -ForegroundColor Cyan

# Open default browser
Start-Process "http://localhost:$port"

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".ico"  = "image/x-icon"
}

$baseDir = $PSScriptRoot

while ($httpListener.IsListening) {
    try {
        $context = $httpListener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($path) -or $path -eq "") {
            $path = "index.html"
        }

        $filePath = Join-Path $baseDir $path

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    } catch {
        # Catch cancellation or client disconnect
    }
}
