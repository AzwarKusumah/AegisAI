param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("chrome", "edge", "firefox")]
    [string]$Browser,

    [string]$AgentPath = "",
    [string]$EnginePath = "",
    [string]$PythonPath = "python",

    [string]$ExtensionId = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path

if ([string]::IsNullOrWhiteSpace($AgentPath)) {
    $AgentPath = Join-Path $repoRoot "agent/rust/target/release/aegisai-agent.exe"
}
if ([string]::IsNullOrWhiteSpace($EnginePath)) {
    $EnginePath = Join-Path $repoRoot "engine"
}

$AgentPath = (Resolve-Path $AgentPath).Path
$EnginePath = (Resolve-Path $EnginePath).Path

if ($Browser -ne "firefox" -and [string]::IsNullOrWhiteSpace($ExtensionId)) {
    throw "Pass -ExtensionId from chrome://extensions for Chrome or Edge."
}

$manifestDirectory = Join-Path $env:LOCALAPPDATA "AegisAI"
New-Item -ItemType Directory -Force -Path $manifestDirectory | Out-Null
$manifestPath = Join-Path $manifestDirectory "com.aegisai.agent.json"

$manifest = @{
    name = "com.aegisai.agent"
    description = "AegisAI local AI attachment inspection host"
    path = $AgentPath
    type = "stdio"
}

if ($Browser -eq "firefox") {
    # Firefox checks this add-on ID against allowed_extensions and passes
    # the manifest path followed by the add-on ID to the native host.
    $manifest.allowed_extensions = @("aegisai@example.invalid")
    $registryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.aegisai.agent"
    [Environment]::SetEnvironmentVariable("AEGIS_FIREFOX_NATIVE_HOST", "1", "User")
    [Environment]::SetEnvironmentVariable("AEGIS_EXTENSION_ORIGINS", $null, "User")
}
else {
    $manifest.allowed_origins = @("chrome-extension://$ExtensionId/")
    if ($Browser -eq "chrome") {
        $registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.aegisai.agent"
    }
    else {
        $registryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.aegisai.agent"
    }
    [Environment]::SetEnvironmentVariable("AEGIS_EXTENSION_ORIGINS", "chrome-extension://$ExtensionId/", "User")
    [Environment]::SetEnvironmentVariable("AEGIS_FIREFOX_NATIVE_HOST", $null, "User")
}

$json = $manifest | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $json, $utf8NoBom)

New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath

[Environment]::SetEnvironmentVariable("AEGIS_ENGINE_PATH", $EnginePath, "User")
[Environment]::SetEnvironmentVariable("AEGIS_PYTHON", $PythonPath, "User")

Write-Host "AegisAI Native Messaging host installed for $Browser."
Write-Host "Manifest: $manifestPath"
Write-Host "Agent:    $AgentPath"
Write-Host "Engine:   $EnginePath"
Write-Host "Restart the browser after installation."
if ($Browser -eq "firefox") {
    Write-Host "Firefox add-on ID must remain aegisai@example.invalid."
}
