# Launch with:
# powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows-gui.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = "AegisAI Endpoint Installer"
$form.Size = New-Object System.Drawing.Size(600, 615)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(12, 18, 32)
$form.ForeColor = [System.Drawing.Color]::FromArgb(232, 240, 250)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

function Add-Label($text, $top) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $text
    $label.Location = New-Object System.Drawing.Point(24, $top)
    $label.Size = New-Object System.Drawing.Size(520, 22)
    $label.ForeColor = [System.Drawing.Color]::FromArgb(190, 205, 222)
    $form.Controls.Add($label)
}
function Add-TextBox($top) {
    $box = New-Object System.Windows.Forms.TextBox
    $box.Location = New-Object System.Drawing.Point(24, $top)
    $box.Size = New-Object System.Drawing.Size(520, 26)
    $box.BackColor = [System.Drawing.Color]::FromArgb(22, 32, 51)
    $box.ForeColor = [System.Drawing.Color]::White
    $box.BorderStyle = "FixedSingle"
    $form.Controls.Add($box)
    return $box
}
$title = New-Object System.Windows.Forms.Label
$title.Text = "AegisAI"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 19)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.Size = New-Object System.Drawing.Size(520, 34)
$form.Controls.Add($title)
$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Register this Windows device with your AegisAI dashboard."
$subtitle.Location = New-Object System.Drawing.Point(26, 55)
$subtitle.Size = New-Object System.Drawing.Size(530, 24)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(145, 163, 187)
$form.Controls.Add($subtitle)

Add-Label "Browser" 95
$browser = New-Object System.Windows.Forms.ComboBox
$browser.Location = New-Object System.Drawing.Point(24, 118)
$browser.Size = New-Object System.Drawing.Size(520, 28)
$browser.DropDownStyle = "DropDownList"
[void]$browser.Items.Add("edge")
[void]$browser.Items.Add("chrome")
$browser.SelectedIndex = 0
$form.Controls.Add($browser)
Add-Label "Browser Extension ID" 157
$extensionId = Add-TextBox 180
Add-Label "API URL (HTTPS recommended; HTTP remote testing requires opt-in)" 217
$serverUrl = Add-TextBox 240
$serverUrl.Text = "https://"
Add-Label "One-time pairing code (Dashboard > Devices)" 277
$pairingCode = Add-TextBox 300
$pairingCode.UseSystemPasswordChar = $true
Add-Label "Python executable path (optional; e.g. full python.exe path)" 337
$pythonPath = Add-TextBox 360
$pythonPath.Text = "python"

$localOnly = New-Object System.Windows.Forms.CheckBox
$localOnly.Text = "Install for local-only testing (do not pair with a dashboard yet)"
$localOnly.Location = New-Object System.Drawing.Point(24, 398)
$localOnly.Size = New-Object System.Drawing.Size(535, 24)
$localOnly.ForeColor = [System.Drawing.Color]::FromArgb(190, 205, 222)
$form.Controls.Add($localOnly)
$allowInsecureHttp = New-Object System.Windows.Forms.CheckBox
$allowInsecureHttp.Text = "Allow insecure HTTP to remote VPS (testing only; credentials are unencrypted)"
$allowInsecureHttp.Location = New-Object System.Drawing.Point(24, 422)
$allowInsecureHttp.Size = New-Object System.Drawing.Size(555, 34)
$allowInsecureHttp.ForeColor = [System.Drawing.Color]::FromArgb(230, 170, 105)
$form.Controls.Add($allowInsecureHttp)
$install = New-Object System.Windows.Forms.Button
$install.Text = "Install and pair device"
$install.Location = New-Object System.Drawing.Point(24, 465)
$install.Size = New-Object System.Drawing.Size(180, 34)
$install.FlatStyle = "Flat"
$install.BackColor = [System.Drawing.Color]::FromArgb(20, 100, 117)
$install.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($install)
$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(216, 465)
$log.Size = New-Object System.Drawing.Size(328, 76)
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = "Vertical"
$log.BackColor = [System.Drawing.Color]::FromArgb(22, 32, 51)
$log.ForeColor = [System.Drawing.Color]::FromArgb(200, 220, 235)
$form.Controls.Add($log)

$install.Add_Click({
    try {
        if ([string]::IsNullOrWhiteSpace($extensionId.Text) -or $extensionId.Text -notmatch '^[a-p]{32}$') {
            throw "Enter the 32-character Extension ID shown on edge://extensions or chrome://extensions."
        }
        $installer = Join-Path $PSScriptRoot "install-windows.ps1"
        if (-not (Test-Path $installer)) { throw "install-windows.ps1 is missing from this package." }
        $installArgs = @{ Browser = [string]$browser.SelectedItem; ExtensionId = $extensionId.Text.Trim(); PythonPath = $pythonPath.Text.Trim() }
        if (-not $localOnly.Checked) {
            if ([string]::IsNullOrWhiteSpace($serverUrl.Text) -or [string]::IsNullOrWhiteSpace($pairingCode.Text)) {
                throw "Enter the HTTPS API URL and one-time pairing code, or select local-only testing."
            }
            $uri = [Uri]$serverUrl.Text.Trim()
            $isLocalHttp = $uri.Scheme -eq "http" -and $uri.Host -in @("localhost", "127.0.0.1")
            if ($uri.Scheme -notin @("https", "http") -or ($uri.Scheme -eq "http" -and -not $isLocalHttp -and -not $allowInsecureHttp.Checked)) {
                throw "For a remote VPS, use HTTPS. For temporary IP-based testing only, enable the insecure HTTP checkbox; the pairing code and device token will be transmitted without encryption."
            }
            $installArgs.ControlPlaneUrl = $serverUrl.Text.Trim().TrimEnd("/")
            $installArgs.PairingCode = $pairingCode.Text.Trim()
            if ($allowInsecureHttp.Checked) { $installArgs.AllowInsecureHttp = $true }
        } else { $installArgs.ControlPlaneUrl = ""; $installArgs.PairingCode = "" }

        $log.AppendText("Starting per-user installation..." + [Environment]::NewLine)
        & $installer @installArgs 2>&1 | ForEach-Object {
            $log.AppendText($_.ToString() + [Environment]::NewLine)
            $log.SelectionStart = $log.Text.Length
            $log.ScrollToCaret()
        }
        if ($LASTEXITCODE -ne 0) { throw "Installer returned a non-zero exit code." }
        [System.Windows.Forms.MessageBox]::Show("AegisAI agent installation completed. Restart the browser.", "AegisAI", "OK", "Information") | Out-Null
    }
    catch {
        $log.AppendText("ERROR: " + $_.Exception.Message + [Environment]::NewLine)
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "AegisAI installation failed", "OK", "Error") | Out-Null
    }
})
[void]$form.ShowDialog()
