param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("chrome", "edge", "firefox")]
    [string]$Browser,
    [string]$AgentPath = "",
    [string]$EnginePath = "",
    [string]$PythonPath = "python",
    [string]$ExtensionId = "",
    [string]$ControlPlaneUrl = "",
    [string]$PairingCode = "",
    [string]$AgentToken = "",
    [switch]$AllowInsecureHttp
)
$ErrorActionPreference = "Stop"

function Resolve-PythonExecutable([string]$Requested) {
    if (-not [string]::IsNullOrWhiteSpace($Requested) -and (Test-Path -LiteralPath $Requested -PathType Leaf)) {
        return (Resolve-Path -LiteralPath $Requested).Path
    }
    if (-not [string]::IsNullOrWhiteSpace($Requested)) {
        $command = Get-Command $Requested -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command -and $command.Source -notlike "$env:LOCALAPPDATA\Microsoft\WindowsApps\*") {
            return $command.Source
        }
    }
    $launcher = Get-Command py.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($launcher) {
        foreach ($version in @("3.13", "3.12", "3.11")) {
            $candidate = & $launcher.Source "-$version" -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $candidate -and (Test-Path -LiteralPath $candidate.Trim() -PathType Leaf)) {
                return $candidate.Trim()
            }
        }
    }
    throw "Python 3.11+ was not found. Enter the full python.exe path in the installer, or install Python with the Python Launcher."
}

$bundleAgent = Join-Path $PSScriptRoot "aegisai-agent.exe"
$bundleEngine = Join-Path $PSScriptRoot "engine"
if ([string]::IsNullOrWhiteSpace($AgentPath) -and (Test-Path $bundleAgent)) {
    $installDirectory = Join-Path $env:LOCALAPPDATA "AegisAI\agent"
    New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
    Copy-Item -Force $bundleAgent (Join-Path $installDirectory "aegisai-agent.exe")
    if (Test-Path $bundleEngine) {
        $destinationEngine = Join-Path $installDirectory "engine"
        if (Test-Path $destinationEngine) { Remove-Item -Recurse -Force $destinationEngine }
        Copy-Item -Recurse $bundleEngine $destinationEngine
    }
    $AgentPath = Join-Path $installDirectory "aegisai-agent.exe"
    $EnginePath = Join-Path $installDirectory "engine"
}
if ([string]::IsNullOrWhiteSpace($AgentPath) -or [string]::IsNullOrWhiteSpace($EnginePath)) {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
    if ([string]::IsNullOrWhiteSpace($AgentPath)) { $AgentPath = Join-Path $repoRoot "agent/rust/target/release/aegisai-agent.exe" }
    if ([string]::IsNullOrWhiteSpace($EnginePath)) { $EnginePath = Join-Path $repoRoot "engine" }
}
$AgentPath = (Resolve-Path $AgentPath).Path
$EnginePath = (Resolve-Path $EnginePath).Path

if ($Browser -ne "firefox" -and [string]::IsNullOrWhiteSpace($ExtensionId)) {
    throw "Pass -ExtensionId from edge://extensions or chrome://extensions."
}
if ([string]::IsNullOrWhiteSpace($ControlPlaneUrl) -xor [string]::IsNullOrWhiteSpace($PairingCode)) {
    throw "ControlPlaneUrl and PairingCode must be supplied together, or both omitted for local-only mode."
}
if (-not [string]::IsNullOrWhiteSpace($ControlPlaneUrl)) {
    $parsedUrl = [Uri]$ControlPlaneUrl
    $isLocalHttp = $parsedUrl.Scheme -eq "http" -and $parsedUrl.Host -in @("localhost", "127.0.0.1")
    if (-not $parsedUrl.IsAbsoluteUri -or $parsedUrl.Scheme -notin @("https", "http") -or ($parsedUrl.Scheme -eq "http" -and -not $isLocalHttp -and -not $AllowInsecureHttp)) {
        throw "Remote enrollment requires HTTPS. To use plain HTTP on a remote VPS, explicitly pass -AllowInsecureHttp for testing only; pairing codes and device tokens will be unencrypted."
    }
    if ($PairingCode -notmatch '^[a-fA-F0-9]{32}$') {
        throw "Pairing code must be the 32-character one-time code from Dashboard > Devices."
    }
}

$pythonExe = Resolve-PythonExecutable $PythonPath
$pythonVersion = & $pythonExe -c "import sys; print('%s.%s' % sys.version_info[:2])"
if ($LASTEXITCODE -ne 0 -or [version]$pythonVersion -lt [version]"3.11") {
    throw "Python 3.11 or newer is required. Found: $pythonVersion"
}

$runtimeDirectory = Split-Path -Parent $AgentPath
$venvDirectory = Join-Path $runtimeDirectory ".venv"
$venvPython = Join-Path $venvDirectory "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    & $pythonExe -m venv $venvDirectory
    if ($LASTEXITCODE -ne 0) { throw "Could not create the local Python virtual environment." }
}
& $venvPython -m pip install --disable-pip-version-check -e "${EnginePath}[documents]"
if ($LASTEXITCODE -ne 0) { throw "Could not install AegisAI document inspection dependencies." }

$manifestDirectory = Join-Path $env:LOCALAPPDATA "AegisAI"
New-Item -ItemType Directory -Force -Path $manifestDirectory | Out-Null
$manifestPath = Join-Path $manifestDirectory "com.aegisai.agent.json"
$manifest = @{ name = "com.aegisai.agent"; description = "AegisAI local AI attachment inspection host"; path = $AgentPath; type = "stdio" }
$extensionOrigin = ""
if ($Browser -eq "firefox") {
    $manifest.allowed_extensions = @("aegisai@example.invalid")
    $registryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.aegisai.agent"
}
else {
    $extensionOrigin = "chrome-extension://$ExtensionId/"
    $manifest.allowed_origins = @($extensionOrigin)
    if ($Browser -eq "chrome") { $registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.aegisai.agent" }
    else { $registryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.aegisai.agent" }
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), $utf8NoBom)
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath

$configDirectory = Join-Path $env:APPDATA "AegisAI"
New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
$configPath = Join-Path $configDirectory "config.json"
$config = @{}
if (Test-Path $configPath) {
    $existing = Get-Content -Raw $configPath | ConvertFrom-Json
    foreach ($property in $existing.PSObject.Properties) { $config[$property.Name] = $property.Value }
}
$config["engine_path"] = $EnginePath
$config["python"] = $venvPython
$config["extension_origins"] = $extensionOrigin
$config["agent_token"] = ""
$config["control_plane_url"] = ""
if (-not [string]::IsNullOrWhiteSpace($AgentToken)) { $config["agent_token"] = $AgentToken }

if (-not [string]::IsNullOrWhiteSpace($ControlPlaneUrl)) {
    $deviceDataDirectory = Join-Path $env:LOCALAPPDATA "AegisAI"
    New-Item -ItemType Directory -Force -Path $deviceDataDirectory | Out-Null
    $deviceIDPath = Join-Path $deviceDataDirectory "device-id"
    if (Test-Path $deviceIDPath) {
        $deviceID = (Get-Content -Raw $deviceIDPath).Trim()
        if ($deviceID -notmatch '^[a-fA-F0-9-]{36}$') { throw "Existing AegisAI device ID is invalid; back up and remove $deviceIDPath before re-enrolling." }
    }
    else {
        $deviceID = [Guid]::NewGuid().ToString()
        [System.IO.File]::WriteAllText($deviceIDPath, $deviceID)
    }

    $enrollment = @{
        pairing_code = $PairingCode
        device_id = $deviceID
        hostname = $env:COMPUTERNAME
        os = "windows"
        username = "$env:USERDOMAIN\$env:USERNAME"
    } | ConvertTo-Json -Compress
    Write-Host "Pairing this device with AegisAI Control Plane..."
    try {
        $result = Invoke-RestMethod -Uri "$($ControlPlaneUrl.TrimEnd('/'))/api/v1/agents/enroll" -Method Post -ContentType "application/json" -Body $enrollment -TimeoutSec 15
    }
    catch {
        throw "Device enrollment failed. Verify HTTPS API routing and that the one-time pairing code is still valid. $($_.Exception.Message)"
    }
    if ($result.status -ne "enrolled" -or $result.device_id -ne $deviceID -or $result.agent_token -notmatch '^[a-fA-F0-9]{64}$') {
        throw "The Control Plane returned an invalid device enrollment response."
    }
    $config["control_plane_url"] = $ControlPlaneUrl.TrimEnd("/")
    $config["agent_token"] = $result.agent_token
}
[System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 5), $utf8NoBom)
[Environment]::SetEnvironmentVariable("AEGIS_ENGINE_PATH", $EnginePath, "User")
[Environment]::SetEnvironmentVariable("AEGIS_PYTHON", $venvPython, "User")
[Environment]::SetEnvironmentVariable("AEGIS_EXTENSION_ORIGINS", $extensionOrigin, "User")

Write-Host "AegisAI Native Messaging host installed for $Browser."
Write-Host "Manifest: $manifestPath"
Write-Host "Agent:    $AgentPath"
Write-Host "Engine:   $EnginePath"
Write-Host "Python:   $venvPython"
Write-Host "Config:   $configPath"
if (-not [string]::IsNullOrWhiteSpace($ControlPlaneUrl)) { Write-Host "Device enrolled with AegisAI dashboard. The agent token is stored locally and was not displayed." }
Write-Host "Restart the browser to load the Native Messaging host."
if ($Browser -eq "firefox") { Write-Host "Firefox add-on ID must remain aegisai@example.invalid." }
