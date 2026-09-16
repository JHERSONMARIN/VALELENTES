using System;
using System.IO;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Threading;

namespace ValeLentesUninstaller
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new UninstallerForm());
        }
    }

    public class UninstallerForm : Form
    {
        private ProgressBar progressBar;
        private Label lblStatus;
        private Label lblTitle;
        private Label lblSubtitle;
        private Button btnUninstall;
        private Button btnCancel;
        private CheckBox chkKeepData;
        private Panel headerPanel;

        public UninstallerForm()
        {
            this.Text = "Desinstalador - VALE-LENTES Óptica POS";
            this.Size = new Size(500, 320);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(245, 247, 250);

            headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 80;
            headerPanel.BackColor = Color.FromArgb(225, 29, 72); // Rose/Red header

            lblTitle = new Label();
            lblTitle.Text = "Desinstalar VALE-LENTES";
            lblTitle.Font = new Font("Segoe UI", 13F, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(20, 16);
            lblTitle.AutoSize = true;

            lblSubtitle = new Label();
            lblSubtitle.Text = "Asistente para remover VALE-LENTES Óptica POS de este equipo";
            lblSubtitle.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(254, 205, 211);
            lblSubtitle.Location = new Point(22, 46);
            lblSubtitle.AutoSize = true;

            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblSubtitle);
            this.Controls.Add(headerPanel);

            lblStatus = new Label();
            lblStatus.Text = "¿Está seguro de que desea desinstalar VALE-LENTES de su equipo?";
            lblStatus.Font = new Font("Segoe UI", 9.5F, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(30, 41, 59);
            lblStatus.Location = new Point(22, 98);
            lblStatus.Size = new Size(440, 30);
            this.Controls.Add(lblStatus);

            chkKeepData = new CheckBox();
            chkKeepData.Text = "Conservar base de datos (ventas, clientes e historial) [Recomendado]";
            chkKeepData.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            chkKeepData.ForeColor = Color.FromArgb(15, 23, 42);
            chkKeepData.Location = new Point(24, 135);
            chkKeepData.Size = new Size(440, 30);
            chkKeepData.Checked = true;
            this.Controls.Add(chkKeepData);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(24, 175);
            progressBar.Size = new Size(436, 20);
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            btnUninstall = new Button();
            btnUninstall.Text = "Desinstalar";
            btnUninstall.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            btnUninstall.Location = new Point(230, 225);
            btnUninstall.Size = new Size(110, 34);
            btnUninstall.BackColor = Color.FromArgb(225, 29, 72);
            btnUninstall.ForeColor = Color.White;
            btnUninstall.FlatStyle = FlatStyle.Flat;
            btnUninstall.FlatAppearance.BorderSize = 0;
            btnUninstall.Click += BtnUninstall_Click;
            this.Controls.Add(btnUninstall);

            btnCancel = new Button();
            btnCancel.Text = "Cancelar";
            btnCancel.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            btnCancel.Location = new Point(350, 225);
            btnCancel.Size = new Size(110, 34);
            btnCancel.BackColor = Color.FromArgb(226, 232, 240);
            btnCancel.ForeColor = Color.FromArgb(30, 41, 59);
            btnCancel.FlatStyle = FlatStyle.Flat;
            btnCancel.FlatAppearance.BorderSize = 0;
            btnCancel.Click += (s, e) => Application.Exit();
            this.Controls.Add(btnCancel);
        }

        private void BtnUninstall_Click(object sender, EventArgs e)
        {
            btnUninstall.Enabled = false;
            btnCancel.Enabled = false;
            chkKeepData.Enabled = false;
            progressBar.Visible = true;
            progressBar.Style = ProgressBarStyle.Marquee;
            lblStatus.Text = "Deteniendo servicios y desinstalando archivos...";

            bool keepData = chkKeepData.Checked;
            string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

            ThreadPool.QueueUserWorkItem((state) =>
            {
                try
                {
                    // 1. Matar procesos node asociados
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/F /IM node.exe");
                        psi.CreateNoWindow = true;
                        psi.UseShellExecute = false;
                        Process.Start(psi).WaitForExit(3000);
                    }
                    catch { }

                    Thread.Sleep(500);

                    // 2. Eliminar acceso directo del Escritorio
                    try
                    {
                        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                        string lnk = Path.Combine(desktop, "VALE-LENTES Óptica POS.lnk");
                        if (File.Exists(lnk)) File.Delete(lnk);
                    }
                    catch { }

                    // 3. Eliminar archivos y carpetas
                    string[] subdirs = new string[] { "bin", "node_modules", "public" };
                    foreach (string sub in subdirs)
                    {
                        string p = Path.Combine(appDir, sub);
                        if (Directory.Exists(p))
                        {
                            try { Directory.Delete(p, true); } catch { }
                        }
                    }

                    if (!keepData)
                    {
                        string dataDir = Path.Combine(appDir, "data");
                        if (Directory.Exists(dataDir))
                        {
                            try { Directory.Delete(dataDir, true); } catch { }
                        }
                    }

                    // Eliminar scripts
                    string[] files = Directory.GetFiles(appDir);
                    string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                    foreach (string f in files)
                    {
                        if (f.Equals(currentExe, StringComparison.OrdinalIgnoreCase)) continue;
                        if (keepData && f.Contains("valelentes.db")) continue;
                        try { File.Delete(f); } catch { }
                    }

                    // Crear script batch temporal en %TEMP% para auto-eliminar el exe desinstalador y la carpeta si está vacía
                    string tempBat = Path.Combine(Path.GetTempPath(), "remove_valelentes.bat");
                    string batLines = "@echo off\r\ntimeout /t 1 >nul\r\ndel \"" + currentExe + "\" >nul 2>nul\r\n";
                    if (!keepData)
                    {
                        batLines += "rmdir \"" + appDir + "\" >nul 2>nul\r\n";
                    }
                    batLines += "del \"%~f0\" >nul 2>nul\r\nexit\r\n";
                    File.WriteAllText(tempBat, batLines);

                    ProcessStartInfo cleanupPsi = new ProcessStartInfo("cmd.exe", "/c \"" + tempBat + "\"");
                    cleanupPsi.CreateNoWindow = true;
                    cleanupPsi.UseShellExecute = false;
                    Process.Start(cleanupPsi);

                    this.Invoke(new Action(() =>
                    {
                        progressBar.Style = ProgressBarStyle.Continuous;
                        progressBar.Value = 100;
                        lblStatus.Text = "¡VALE-LENTES ha sido desinstalado correctamente!";
                        lblStatus.ForeColor = Color.FromArgb(22, 101, 52);
                        btnCancel.Text = "Cerrar";
                        btnCancel.Enabled = true;
                    }));
                }
                catch (Exception ex)
                {
                    this.Invoke(new Action(() =>
                    {
                        lblStatus.Text = "Error: " + ex.Message;
                        lblStatus.ForeColor = Color.Red;
                        btnCancel.Text = "Cerrar";
                        btnCancel.Enabled = true;
                    }));
                }
            });
        }
    }
}
