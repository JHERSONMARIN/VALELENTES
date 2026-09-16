$appUrl = 'http://localhost:3008'
$launched = $false

try {
    $progId = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice' -ErrorAction SilentlyContinue).ProgId
    if ($progId -like '*Chrome*') {
        $paths = @(
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
        )
        foreach ($p in $paths) {
            if ($p -and (Test-Path $p)) {
                Start-Process $p -ArgumentList "--app=$appUrl"
                $launched = $true
                break
            }
        }
    } elseif ($progId -like '*Brave*') {
        $paths = @(
            "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
            "$env:LocalAppData\BraveSoftware\Brave-Browser\Application\brave.exe"
        )
        foreach ($p in $paths) {
            if ($p -and (Test-Path $p)) {
                Start-Process $p -ArgumentList "--app=$appUrl"
                $launched = $true
                break
            }
        }
    } elseif ($progId -like '*Edge*') {
        $paths = @(
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
        )
        foreach ($p in $paths) {
            if ($p -and (Test-Path $p)) {
                Start-Process $p -ArgumentList "--app=$appUrl"
                $launched = $true
                break
            }
        }
    }
} catch {}

if (-not $launched) {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
        "$env:LocalAppData\BraveSoftware\Brave-Browser\Application\brave.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) {
            Start-Process $c -ArgumentList "--app=$appUrl"
            $launched = $true
            break
        }
    }
}

if (-not $launched) {
    Start-Process $appUrl
}
