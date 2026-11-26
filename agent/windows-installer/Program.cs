using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Security;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace AegisAI.Installer;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new InstallerForm());
    }
}

internal sealed class InstallerForm : Form
{
    private readonly TextBox apiUrl = new() { Text = "https://", Width = 420 };
    private readonly TextBox pairingCode = new() { UseSystemPasswordChar = true, Width = 420 };
    private readonly TextBox extensionId = new() { Width = 420 };
    private readonly TextBox extensionFolder = new() { ReadOnly = true, Width = 420 };
    private readonly ComboBox browser = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 160 };
    private readonly CheckBox insecureHttp = new() { Text = "Allow plain HTTP to a public VPS for temporary testing only", AutoSize = true };
    private readonly Label status = new() { AutoSize = false, Height = 42, Width = 540, ForeColor = Color.FromArgb(88, 101, 92) };
    private readonly Button install = new() { Text = "Install and pair", Width = 150, Height = 40 };
    private string appRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AegisAI");

    public InstallerForm()
    {
        Text = "AegisAI Installer";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        ClientSize = new Size(610, 650);
        BackColor = Color.FromArgb(247, 248, 245);
        Font = new Font("Segoe UI", 9.5f);
        BuildLayout();
        Shown += (_, _) => PrepareBundle();
    }

    private void BuildLayout()
    {
        var brand = new Label {
            Text = "AegisAI",
            Font = new Font("Segoe UI Semibold", 19),
            ForeColor = Color.FromArgb(32, 40, 34),
            Location = new Point(28, 20),
            AutoSize = true
        };
        Controls.Add(brand);
        var subtitle = new Label {
            Text = "Endpoint protection · Windows",
            Font = new Font("Segoe UI", 10),
            ForeColor = Color.FromArgb(103, 116, 107),
            Location = new Point(30, 54),
            AutoSize = true
        };
        Controls.Add(subtitle);
        AddSeparator(84);

        AddLabel("Browser", 105);
        browser.Items.AddRange(new object[] { "Microsoft Edge", "Google Chrome" });
        browser.SelectedIndex = 0;
        browser.Location = new Point(30, 128);
        Controls.Add(browser);

        var openExtensions = new Button { Text = "Open extension settings", Location = new Point(210, 126), Width = 175, Height = 30 };
        openExtensions.Click += (_, _) => OpenExtensionSettings();
        Controls.Add(openExtensions);

        AddLabel("Extension folder · load unpacked once", 174);
        extensionFolder.Location = new Point(30, 198);
        Controls.Add(extensionFolder);
        var copyPath = new Button { Text = "Copy folder path", Location = new Point(460, 196), Width = 120, Height = 28 };
        copyPath.Click += (_, _) => Clipboard.SetText(extensionFolder.Text);
        Controls.Add(copyPath);

        AddSeparator(240);
        AddLabel("Control Plane API URL", 258);
        apiUrl.Location = new Point(30, 282);
        Controls.Add(apiUrl);

        AddLabel("One-time pairing code", 326);
        pairingCode.Location = new Point(30, 350);
        Controls.Add(pairingCode);

        AddLabel("Extension ID", 394);
        extensionId.Location = new Point(30, 418);
        Controls.Add(extensionId);

        insecureHttp.Location = new Point(30, 464);
        insecureHttp.ForeColor = Color.FromArgb(135, 92, 37);
        Controls.Add(insecureHttp);

        status.Location = new Point(30, 505);
        status.Text = "Preparing the self-contained endpoint runtime…";
        Controls.Add(status);

        install.Location = new Point(430, 565);
        install.BackColor = Color.FromArgb(49, 91, 73);
        install.ForeColor = Color.White;
        install.FlatStyle = FlatStyle.Flat;
        install.FlatAppearance.BorderSize = 0;
        install.Click += async (_, _) => await InstallAndEnrollAsync();
        Controls.Add(install);

        var note = new Label {
            Text = "The installer includes the Agent and local document inspection runtime. No PowerShell window or separate Python installation is required.",
            Location = new Point(30, 568),
            Width = 380,
            Height = 56,
            ForeColor = Color.FromArgb(103, 116, 107),
            Font = new Font("Segoe UI", 8.5f)
        };
        Controls.Add(note);
    }

    private void AddLabel(string text, int y)
    {
        Controls.Add(new Label {
            Text = text,
            Location = new Point(30, y),
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 9.5f),
            ForeColor = Color.FromArgb(57, 69, 60)
        });
    }

    private void AddSeparator(int y)
    {
        Controls.Add(new Panel {
            Location = new Point(28, y),
            Size = new Size(554, 1),
            BackColor = Color.FromArgb(220, 226, 220)
        });
    }

    private void PrepareBundle()
    {
        try
        {
            Directory.CreateDirectory(appRoot);
            using var stream = typeof(InstallerForm).Assembly.GetManifestResourceStream("AegisAI.Installer.Bundle.zip")
                ?? throw new InvalidOperationException("The installer payload is missing.");
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name)) continue;
                var target = Path.GetFullPath(Path.Combine(appRoot, entry.FullName));
                var root = Path.GetFullPath(appRoot) + Path.DirectorySeparatorChar;
                if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Invalid file path in installer payload.");
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                entry.ExtractToFile(target, overwrite: true);
            }
            extensionFolder.Text = Path.Combine(appRoot, "extension", "chromium");
            if (!Directory.Exists(extensionFolder.Text))
                throw new DirectoryNotFoundException("The browser extension is missing from the installer payload.");
            status.Text = "Ready. Load the included browser extension once, then enter its ID and your pairing code.";
            install.Enabled = true;
        }
        catch (Exception error)
        {
            status.Text = "Installer payload error: " + error.Message;
            install.Enabled = false;
        }
    }

    private void OpenExtensionSettings()
    {
        var url = browser.SelectedIndex == 0 ? "edge://extensions/" : "chrome://extensions/";
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception error) { MessageBox.Show(this, error.Message, "Could not open browser", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private async Task InstallAndEnrollAsync()
    {
        install.Enabled = false;
        status.Text = "Checking settings…";
        try
        {
            if (!Uri.TryCreate(apiUrl.Text.Trim(), UriKind.Absolute, out var api) ||
                (api.Scheme != Uri.UriSchemeHttps && api.Scheme != Uri.UriSchemeHttp))
                throw new InvalidOperationException("Enter a valid HTTP or HTTPS API URL.");

            var isLocal = api.IsLoopback || api.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase);
            if (api.Scheme == Uri.UriSchemeHttp && !isLocal && !insecureHttp.Checked)
                throw new InvalidOperationException("Remote HTTP requires the explicit testing checkbox. HTTPS is strongly recommended.");

            var id = extensionId.Text.Trim().ToLowerInvariant();
            if (!Regex.IsMatch(id, "^[a-p]{32}$"))
                throw new InvalidOperationException("Enter the 32-character extension ID shown on the browser extensions page.");

            var code = Regex.Replace(pairingCode.Text, "\\s+", "");
            if (code.Length != 32 || !Regex.IsMatch(code, "^[0-9a-fA-F]{32}$"))
                throw new InvalidOperationException("The pairing code must contain 32 hexadecimal characters.");

            // The Native Messaging Agent reads its stable device ID from
            // %LOCALAPPDATA%\\AegisAI\\device-id. Persist exactly the ID enrolled here.
            Directory.CreateDirectory(appRoot);
            var deviceIdPath = Path.Combine(appRoot, "device-id");
            string deviceId;
            if (File.Exists(deviceIdPath))
            {
                deviceId = (await File.ReadAllTextAsync(deviceIdPath)).Trim();
                if (!Guid.TryParse(deviceId, out _))
                    throw new InvalidOperationException("The existing AegisAI device ID is invalid. Remove the old device registration before reinstalling.");
            }
            else
            {
                deviceId = Guid.NewGuid().ToString();
                await File.WriteAllTextAsync(deviceIdPath, deviceId, new UTF8Encoding(false));
            }

            status.Text = "Requesting device enrollment…";
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            var request = new {
                pairing_code = code,
                device_id = deviceId,
                hostname = Environment.MachineName,
                os = "windows",
                username = Environment.UserName
            };
            using var response = await client.PostAsJsonAsync(
                new Uri(api.ToString().TrimEnd('/') + "/api/v1/agents/enroll"), request);
            var responseText = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                var message = response.StatusCode switch {
                    HttpStatusCode.Unauthorized => "The pairing code is invalid, expired, or already used. Create a new code in Dashboard → Devices.",
                    HttpStatusCode.BadRequest => "The Control Plane rejected the device details. Check the API URL and pairing code.",
                    HttpStatusCode.NotFound => "The enrollment endpoint was not found. Check that the API URL points to the Control Plane, not the Dashboard.",
                    _ => "Enrollment failed (" + (int)response.StatusCode + "): " + responseText
                };
                throw new InvalidOperationException(message);
            }

            using var result = JsonDocument.Parse(responseText);
            var token = result.RootElement.GetProperty("agent_token").GetString();
            if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("The server did not return a device credential.");

            status.Text = "Writing endpoint configuration…";
            var origin = "chrome-extension://" + id + "/";
            var agentPath = Path.Combine(appRoot, "aegisai-agent.exe");
            var pythonPath = Path.Combine(appRoot, "python", "python.exe");
            var enginePath = Path.Combine(appRoot, "engine");
            if (!File.Exists(agentPath) || !File.Exists(pythonPath) || !Directory.Exists(Path.Combine(enginePath, "aegis_inspector")))
                throw new FileNotFoundException("The embedded Agent or Python runtime is incomplete.");

            var configDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AegisAI");
            Directory.CreateDirectory(configDirectory);
            var config = new {
                control_plane_url = api.ToString().TrimEnd('/'),
                agent_token = token,
                extension_origins = origin,
                python = pythonPath,
                engine_path = enginePath
            };
            var configPath = Path.Combine(configDirectory, "config.json");
            await File.WriteAllTextAsync(configPath, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
            File.SetAttributes(configPath, File.GetAttributes(configPath) | FileAttributes.Hidden);

            var manifestPath = Path.Combine(appRoot, "com.aegisai.agent.json");
            var manifest = new {
                name = "com.aegisai.agent",
                description = "AegisAI local document inspection host",
                path = agentPath,
                type = "stdio",
                allowed_origins = new[] { origin }
            };
            await File.WriteAllTextAsync(manifestPath, JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));

            var registryPath = browser.SelectedIndex == 0
                ? @"Software\Microsoft\Edge\NativeMessagingHosts\com.aegisai.agent"
                : @"Software\Google\Chrome\NativeMessagingHosts\com.aegisai.agent";
            using (var key = Registry.CurrentUser.CreateSubKey(registryPath))
                key?.SetValue("", manifestPath, RegistryValueKind.String);

            status.Text = "Installation completed. Restart the browser to activate the native host.";
            MessageBox.Show(this,
                "AegisAI Agent was installed and the device was enrolled.\n\n" +
                "Restart your browser. The extension must be loaded unpacked once from:\n" + extensionFolder.Text +
                "\n\nThe extension ID is registered with the local Agent.",
                "AegisAI installed", MessageBoxButtons.OK, MessageBoxIcon.Information);
            OpenExtensionSettings();
        }
        catch (Exception error)
        {
            status.Text = error.Message;
            MessageBox.Show(this, error.Message, "AegisAI installation failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            install.Enabled = true;
        }
    }
}
