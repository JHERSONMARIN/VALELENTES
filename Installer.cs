using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Threading;

namespace ValeLentesInstaller
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }

    public class InstallerForm : Form
    {
        private ProgressBar progressBar;
        private Label lblStatus;
        private Label lblTitle;
        private Label lblSubtitle;
        private Button btnAction;
        private Panel headerPanel;
        private string finalInstallDir = "";

        public InstallerForm()
        {
            this.Text = "Instalador - VALE-LENTES Óptica POS";
            this.Size = new Size(500, 290);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(245, 247, 250);

            headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 85;
            headerPanel.BackColor = Color.FromArgb(15, 23, 42); // Slate dark

            lblTitle = new Label();
            lblTitle.Text = "VALE-LENTES Óptica POS";
            lblTitle.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(20, 16);
            lblTitle.AutoSize = true;

            lblSubtitle = new Label();
            lblSubtitle.Text = "Instalador Autónomo Local by VT VALETEC";
            lblSubtitle.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(148, 163, 184);
            lblSubtitle.Location = new Point(22, 48);
            lblSubtitle.AutoSize = true;

            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblSubtitle);
            this.Controls.Add(headerPanel);

            lblStatus = new Label();
            lblStatus.Text = "Preparando instalación...";
            lblStatus.Font = new Font("Segoe UI", 9.5F, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(30, 41, 59);
            lblStatus.Location = new Point(22, 105);
            lblStatus.Size = new Size(440, 25);
            this.Controls.Add(lblStatus);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(24, 135);
            progressBar.Size = new Size(436, 22);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 30;
            this.Controls.Add(progressBar);

            btnAction = new Button();
            btnAction.Text = "Instalando...";
            btnAction.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            btnAction.Location = new Point(340, 190);
            btnAction.Size = new Size(120, 34);
            btnAction.BackColor = Color.FromArgb(14, 165, 233);
            btnAction.ForeColor = Color.White;
            btnAction.FlatStyle = FlatStyle.Flat;
            btnAction.FlatAppearance.BorderSize = 0;
            btnAction.Enabled = false;
            btnAction.Click += BtnAction_Click;
            this.Controls.Add(btnAction);

            this.Shown += (s, e) => StartInstallation();
        }

        private void StartInstallation()
        {
            ThreadPool.QueueUserWorkItem((state) =>
            {
                try
                {
                    UpdateStatus("Determinando directorio de instalación...");
                    Thread.Sleep(500);

                    string targetDir = @"C:\VALE-LENTES";
                    try
                    {
                        if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);
                        // Probar escritura
                        string testFile = Path.Combine(targetDir, "_test.tmp");
                        File.WriteAllText(testFile, "test");
                        File.Delete(testFile);
                    }
                    catch
                    {
                        targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VALE-LENTES");
                        if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);
                    }

                    finalInstallDir = targetDir;
                    UpdateStatus("Extrayendo archivos del sistema en " + targetDir + "...");

                    // Extraer ZIP embebido en recursos
                    Assembly asm = Assembly.GetExecutingAssembly();
                    using (Stream stream = asm.GetManifestResourceStream("package.zip"))
                    {
                        if (stream == null)
                        {
                            throw new Exception("No se encontró el paquete de instalación embebido.");
                        }

                        using (ZipArchive archive = new ZipArchive(stream))
                        {
                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                if (string.IsNullOrEmpty(entry.Name) && (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\")))
                                {
                                    string dirPath = Path.Combine(targetDir, entry.FullName);
                                    if (!Directory.Exists(dirPath)) Directory.CreateDirectory(dirPath);
                                    continue;
                                }

                                string destinationPath = Path.Combine(targetDir, entry.FullName);
                                string parentDir = Path.GetDirectoryName(destinationPath);
                                if (!Directory.Exists(parentDir)) Directory.CreateDirectory(parentDir);

                                // Si la base de datos ya existe, no sobrescribirla para proteger datos de ventas anteriores
                                if (entry.FullName.Contains("valelentes.db") && File.Exists(destinationPath))
                                {
                                    continue;
                                }

                                entry.ExtractToFile(destinationPath, true);
                            }
                        }
                    }

                    UpdateStatus("Creando acceso directo en el Escritorio...");
                    CreateShortcut(targetDir);
                    Thread.Sleep(500);

                    this.Invoke(new Action(() =>
                    {
                        progressBar.Style = ProgressBarStyle.Continuous;
                        progressBar.Value = 100;
                        lblStatus.Text = "¡Instalación completada con éxito en el Escritorio!";
                        lblStatus.ForeColor = Color.FromArgb(22, 101, 52); // Green
                        btnAction.Text = "Iniciar Sistema";
                        btnAction.Enabled = true;
                        btnAction.BackColor = Color.FromArgb(34, 197, 94);
                    }));
                }
                catch (Exception ex)
                {
                    this.Invoke(new Action(() =>
                    {
                        progressBar.Visible = false;
                        lblStatus.Text = "Error al instalar: " + ex.Message;
                        lblStatus.ForeColor = Color.Red;
                        btnAction.Text = "Cerrar";
                        btnAction.Enabled = true;
                    }));
                }
            });
        }

        private void CreateShortcut(string targetDir)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string shortcutPath = Path.Combine(desktop, "VALE-LENTES Óptica POS.lnk");

                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = Path.Combine(targetDir, "iniciar_valelentes.bat");
                shortcut.WorkingDirectory = targetDir;
                shortcut.Description = "VALE-LENTES Óptica POS by VT VALETEC";

                string iconPath = Path.Combine(targetDir, @"public\img\logo.ico");
                if (File.Exists(iconPath))
                {
                    shortcut.IconLocation = iconPath + ",0";
                }
                shortcut.Save();
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error creando acceso directo: " + ex.Message);
            }
        }

        private void UpdateStatus(string message)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action<string>(UpdateStatus), message);
                return;
            }
            lblStatus.Text = message;
        }

        private void BtnAction_Click(object sender, EventArgs e)
        {
            if (btnAction.Text == "Iniciar Sistema")
            {
                try
                {
                    string batPath = Path.Combine(finalInstallDir, "iniciar_valelentes.bat");
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = batPath;
                    psi.WorkingDirectory = finalInstallDir;
                    Process.Start(psi);
                }
                catch { }
            }
            Application.Exit();
        }
    }
}
