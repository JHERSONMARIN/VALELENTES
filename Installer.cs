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
        private Label lblDirPrompt;
        private TextBox txtInstallDir;
        private Button btnBrowse;
        private Button btnInstall;
        private Button btnCancel;
        private Panel headerPanel;
        private string finalInstallDir = "";

        public InstallerForm()
        {
            this.Text = "Instalador - VALE-LENTES Óptica POS";
            this.Size = new Size(540, 360);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(245, 247, 250);

            // Header Panel
            headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 80;
            headerPanel.BackColor = Color.FromArgb(15, 23, 42); // Slate 900

            lblTitle = new Label();
            lblTitle.Text = "VALE-LENTES Óptica POS";
            lblTitle.Font = new Font("Segoe UI", 13.5F, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(20, 14);
            lblTitle.AutoSize = true;

            lblSubtitle = new Label();
            lblSubtitle.Text = "Asistente de Instalación - Sistema POS Óptica by VT VALETEC";
            lblSubtitle.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(148, 163, 184);
            lblSubtitle.Location = new Point(22, 44);
            lblSubtitle.AutoSize = true;

            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblSubtitle);
            this.Controls.Add(headerPanel);

            // Path prompt
            lblDirPrompt = new Label();
            lblDirPrompt.Text = "Seleccione la carpeta donde desea instalar el sistema:";
            lblDirPrompt.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            lblDirPrompt.ForeColor = Color.FromArgb(30, 41, 59);
            lblDirPrompt.Location = new Point(22, 98);
            lblDirPrompt.Size = new Size(480, 22);
            this.Controls.Add(lblDirPrompt);

            // Textbox for path
            txtInstallDir = new TextBox();
            txtInstallDir.Text = @"C:\VALE-LENTES";
            txtInstallDir.Font = new Font("Segoe UI", 9.5F, FontStyle.Regular);
            txtInstallDir.Location = new Point(24, 126);
            txtInstallDir.Size = new Size(365, 26);
            this.Controls.Add(txtInstallDir);

            // Browse button
            btnBrowse = new Button();
            btnBrowse.Text = "Examinar...";
            btnBrowse.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            btnBrowse.Location = new Point(398, 124);
            btnBrowse.Size = new Size(100, 30);
            btnBrowse.BackColor = Color.FromArgb(226, 232, 240);
            btnBrowse.ForeColor = Color.FromArgb(15, 23, 42);
            btnBrowse.FlatStyle = FlatStyle.Flat;
            btnBrowse.FlatAppearance.BorderSize = 0;
            btnBrowse.Click += BtnBrowse_Click;
            this.Controls.Add(btnBrowse);

            // Status Label
            lblStatus = new Label();
            lblStatus.Text = "Haga clic en \"Instalar\" para comenzar la instalación.";
            lblStatus.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(100, 116, 139);
            lblStatus.Location = new Point(22, 170);
            lblStatus.Size = new Size(480, 22);
            this.Controls.Add(lblStatus);

            // Progress bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(24, 198);
            progressBar.Size = new Size(475, 22);
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            // Install Button
            btnInstall = new Button();
            btnInstall.Text = "Instalar";
            btnInstall.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            btnInstall.Location = new Point(265, 255);
            btnInstall.Size = new Size(115, 36);
            btnInstall.BackColor = Color.FromArgb(14, 165, 233);
            btnInstall.ForeColor = Color.White;
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Click += BtnInstall_Click;
            this.Controls.Add(btnInstall);

            // Cancel Button
            btnCancel = new Button();
            btnCancel.Text = "Cancelar";
            btnCancel.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            btnCancel.Location = new Point(390, 255);
            btnCancel.Size = new Size(110, 36);
            btnCancel.BackColor = Color.FromArgb(226, 232, 240);
            btnCancel.ForeColor = Color.FromArgb(30, 41, 59);
            btnCancel.FlatStyle = FlatStyle.Flat;
            btnCancel.FlatAppearance.BorderSize = 0;
            btnCancel.Click += (s, e) => Application.Exit();
            this.Controls.Add(btnCancel);
        }

        private void BtnBrowse_Click(object sender, EventArgs e)
        {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Seleccione la carpeta para instalar VALE-LENTES:";
                fbd.ShowNewFolderButton = true;
                if (Directory.Exists(txtInstallDir.Text))
                {
                    fbd.SelectedPath = txtInstallDir.Text;
                }
                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    txtInstallDir.Text = fbd.SelectedPath;
                }
            }
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            if (btnInstall.Text == "Iniciar Sistema")
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
                Application.Exit();
                return;
            }

            string targetPath = txtInstallDir.Text.Trim();
            if (string.IsNullOrEmpty(targetPath))
            {
                MessageBox.Show("Por favor indique una ruta válida para instalar.", "Atención", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Deshabilitar controles
            btnInstall.Enabled = false;
            btnBrowse.Enabled = false;
            txtInstallDir.Enabled = false;
            btnCancel.Enabled = false;

            progressBar.Visible = true;
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 30;
            lblStatus.Text = "Instalando archivos en " + targetPath + "...";
            lblStatus.ForeColor = Color.FromArgb(14, 165, 233);

            ThreadPool.QueueUserWorkItem((state) =>
            {
                try
                {
                    if (!Directory.Exists(targetPath))
                    {
                        Directory.CreateDirectory(targetPath);
                    }

                    finalInstallDir = targetPath;

                    // Extraer ZIP embebido
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
                                    string dirPath = Path.Combine(targetPath, entry.FullName);
                                    if (!Directory.Exists(dirPath)) Directory.CreateDirectory(dirPath);
                                    continue;
                                }

                                string destinationPath = Path.Combine(targetPath, entry.FullName);
                                string parentDir = Path.GetDirectoryName(destinationPath);
                                if (!Directory.Exists(parentDir)) Directory.CreateDirectory(parentDir);

                                // Si la base de datos ya existe, no sobrescribirla
                                if (entry.FullName.Contains("valelentes.db") && File.Exists(destinationPath))
                                {
                                    continue;
                                }

                                entry.ExtractToFile(destinationPath, true);
                            }
                        }
                    }

                    UpdateStatus("Creando acceso directo en el Escritorio...");
                    CreateShortcut(targetPath);
                    Thread.Sleep(500);

                    this.Invoke(new Action(() =>
                    {
                        progressBar.Style = ProgressBarStyle.Continuous;
                        progressBar.Value = 100;
                        lblStatus.Text = "¡Instalación completada con éxito!";
                        lblStatus.ForeColor = Color.FromArgb(22, 101, 52);
                        btnInstall.Text = "Iniciar Sistema";
                        btnInstall.BackColor = Color.FromArgb(34, 197, 94);
                        btnInstall.Enabled = true;
                        btnCancel.Text = "Cerrar";
                        btnCancel.Enabled = true;
                    }));
                }
                catch (Exception ex)
                {
                    this.Invoke(new Action(() =>
                    {
                        progressBar.Visible = false;
                        lblStatus.Text = "Error durante la instalación: " + ex.Message;
                        lblStatus.ForeColor = Color.Red;
                        btnInstall.Text = "Reintentar";
                        btnInstall.Enabled = true;
                        btnBrowse.Enabled = true;
                        txtInstallDir.Enabled = true;
                        btnCancel.Enabled = true;
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
    }
}
