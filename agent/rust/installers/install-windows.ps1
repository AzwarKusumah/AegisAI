param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("chrome", "edge", "firefox")]
    [string]$Browser,
    [string]$AgentPath = "",
    [string]$EnginePath = "",
    [string]$PythonPath = "python",
    [string]$ExtensionId = "",
    [string]$ControlPlaneUrl = "",
    [string]$AgentToken = ""
)

$ErrorActionPreference = "Stop"

# A release bundle is self-contained. Source-checkout installs retain legacy defaults.
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
    if ([string]::IsNullOrWhiteSpace($AgentPath)) {
        $AgentPath = Join-Path $repoRoot "agent/rust/target/release/aegisai-agent.exe"
    }
    if ([string]::IsNullOrWhiteSpace($EnginePath)) {
        $EnginePath = Join-Path $repoRoot "engine"
    }
}
$AgentPath = (Resolve-Path $AgentPath).Path
$EnginePath = (Resolve-Path $EnginePath).Path

if ($Browser -ne "firefox" -and [string]::IsNullOrWhiteSpace($ExtensionId)) {
    throw "Pass -ExtensionId from chrome://extensions or edge://extensions."
}

# Install the inspector into a private virtual environment beside the agent.
$runtimeDirectory = Split-Path -Parent $AgentPath
$venvDirectory = Join-Path $runtimeDirectory ".venv"
$venvPython = Join-Path $venvDirectory "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    & $PythonPath -m venv $venvDirectory
    if ($LASTEXITCODE -ne 0) { throw "Could not create the local Python virtual environment." }
}
& $venvPython -m pip install --disable-pip-version-check -e "$EnginePath[documents]"
if ($LASTEXITCODE -ne 0) { throw "Could not install AegisAI inspector dependencies." }
$PythonPath = $venvPython

$manifestDirectory = Join-Path $env:LOCALAPPDATA "AegisAI"
New-Item -ItemType Directory -Force -Path $manifestDirectory | Out-Null
$manifestPath = Join-Path $manifestDirectory "com.aegisai.agent.json"
$manifest = @{
    name = "com.aegisai.agent"
    description = "AegisAI local AI attachment inspection host"
    path = $AgentPath
    type = "stdio"
}

$extensionOrigin = ""
if ($Browser -eq "firefox") {
    $manifest.allowed_extensions = @("aegisai@example.invalid")
    $registryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.aegisai.agent"
}
else {
    $extensionOrigin = "chrome-extension://$ExtensionId/"
    $manifest.allowed_origins = @($extensionOrigin)
    if ($Browser -eq "chrome") {
        $registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.aegisai.agent"
    }
    else {
        $registryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.aegisai.agent"
    }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), $utf8NoBom)
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath

# dirs::config_dir() resolves to %APPDATA% on Windows.
$configDirectory = Join-Path $env:APPDATA "AegisAI"
New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
$configPath = Join-Path $configDirectory "config.json"
$config = @{}
if (Test-Path $configPath) {
    $existing = Get-Content -Raw $configPath | ConvertFrom-Json
    foreach ($property in $existing.PSObject.Properties) { $config[$property.Name] = $property.Value }
}
$config["engine_path"] = $EnginePath
$config["python"] = $PythonPath
$config["extension_origins"] = $extensionOrigin
if (-not [string]::IsNullOrWhiteSpace($ControlPlaneUrl)) { $config["control_plane_url"] = $ControlPlaneUrl }
if (-not [string]::IsNullOrWhiteSpace($AgentToken)) { $config["agent_token"] = $AgentToken }
[System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 5), $utf8NoBom)

# Keep variables for compatibility with older agent builds.
[Environment]::SetEnvironmentVariable("AEGIS_ENGINE_PATH", $EnginePath, "User")
[Environment]::SetEnvironmentVariable("AEGIS_PYTHON", $PythonPath, "User")
[Environment]::SetEnvironmentVariable("AEGIS_EXTENSION_ORIGINS", $extensionOrigin, "User")

Write-Host "AegisAI Native Messaging host installed for $Browser."
Write-Host "Manifest: $manifestPath"
Write-Host "Agent:    $AgentPath"
Write-Host "Engine:   $EnginePath"
Write-Host "Python:   $PythonPath"
Write-Host "Config:   $configPath"
Write-Host "Restart the browser after installation."
if ($Browser -eq "firefox") {
    Write-Host "Firefox add-on ID must remain aegisai@example.invalid."
}
