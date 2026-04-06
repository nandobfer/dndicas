/**
 * @fileoverview LibreTranslateServer — manages the lifecycle of a local
 * LibreTranslate Python server.
 *
 * Responsibilities:
 *  - Check whether pip is available (bootstraps it via get-pip.py if not)
 *  - Check whether libretranslate pip package is installed
 *  - Check whether an en→pt-BR or en→pt argostranslate model is downloaded
 *  - Install the local pt-BR model (translate-en_pb-1_9.argosmodel) if present
 *  - Run setup with live terminal output
 *  - Spawn the server process and wait until it responds to HTTP requests
 *  - Stop the server cleanly on exit
 *
 * Python 3 must be available as `python3` on PATH.
 *
 * Model preference:
 *   1. en→pb  (Portuguese Brazil, from local .argosmodel file)
 *   2. en→pt  (Portuguese, downloaded from argostranslate index — pt-PT)
 *
 * Notes on Debian/Ubuntu:
 *   System Python is "externally managed" (PEP 668). pip may not be installed
 *   and user-level installs require --break-system-packages. This class handles
 *   all of that automatically.
 */

import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import terminal from 'terminal-kit';

const term = terminal.terminal;

// Path to the bundled pt-BR argostranslate model (same directory as this file)
const PTBR_MODEL_FILE = path.join(__dirname, 'translate-en_pb-1_9.argosmodel');

// Python snippet that detects which en→pt model is installed.
// Prints "pb" (pt-BR), "pt" (pt-PT fallback), or "not_ready".
const CHECK_MODELS_SCRIPT = `
from argostranslate import package
pkgs = package.get_installed_packages()
codes = [(p.from_code, p.to_code) for p in pkgs]
if ("en", "pb") in codes:
    print("pb")
elif ("en", "pt") in codes:
    print("pt")
else:
    print("not_ready")
`.trim();

// Python snippet that installs the pt-BR model from a local .argosmodel file.
const makeInstallPtBrScript = (modelPath: string): string => `
from argostranslate import package
import sys
print("Instalando modelo pt-BR de ${modelPath.replace(/\\/g, '/')}...")
sys.stdout.flush()
package.install_from_path("${modelPath.replace(/\\/g, '/')}")
print("done")
`.trim();

// Python snippet that downloads and installs the en→pt argostranslate model
const INSTALL_PT_MODEL_SCRIPT = `
from argostranslate import package
import sys
print("Atualizando índice de pacotes...")
sys.stdout.flush()
package.update_package_index()
available = package.get_available_packages()
pkg = next((p for p in available if p.from_code == "en" and p.to_code == "pt"), None)
if pkg is None:
    print("ERRO: modelo en->pt nao encontrado no indice!")
    sys.exit(1)
print(f"Baixando modelo {pkg.from_name} -> {pkg.to_name}...")
sys.stdout.flush()
path = pkg.download()
print("Instalando modelo...")
sys.stdout.flush()
package.install_from_path(path)
print("done")
`.trim();

// Python snippet that downloads get-pip.py and installs pip for the current user.
// Uses --break-system-packages to bypass PEP 668 restrictions on Debian/Ubuntu.
const BOOTSTRAP_PIP_SCRIPT = `
import urllib.request, subprocess, sys, os, tempfile
print("Baixando bootstrap do pip...")
sys.stdout.flush()
tmp = os.path.join(tempfile.gettempdir(), "get-pip-bootstrap.py")
urllib.request.urlretrieve("https://bootstrap.pypa.io/get-pip.py", tmp)
print("Instalando pip (usuario atual)...")
sys.stdout.flush()
subprocess.run(
    [sys.executable, tmp, "--user", "--break-system-packages"],
    check=True
)
os.remove(tmp)
print("done")
`.trim();

export class LibreTranslateServer {
    private serverProcess: ChildProcess | null = null;
    private readonly port: number;
    private readonly host: string;

    /**
     * The language code for the active translation target.
     * Set after setup/start — use this in the translation API call.
     *   'pb' = Portuguese (Brazil) — from bundled .argosmodel file
     *   'pt' = Portuguese (Portugal) — fallback from argostranslate index
     */
    activeTargetCode: string = 'pt';

    constructor(port = 5000, host = '127.0.0.1') {
        this.port = port;
        this.host = host;
    }

    get url(): string {
        return `http://${this.host}:${this.port}`;
    }

    // ─── Setup checks ─────────────────────────────────────────────────────────

    async isPipAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const proc = spawn('python3', ['-m', 'pip', '--version'], { stdio: 'ignore' });
            proc.on('close', (code) => resolve(code === 0));
        });
    }

    async isPackageInstalled(): Promise<boolean> {
        return new Promise((resolve) => {
            const proc = spawn('python3', ['-c', 'import libretranslate'], {
                stdio: 'ignore',
            });
            proc.on('close', (code) => resolve(code === 0));
        });
    }

    /**
     * Detects which en→pt model is currently installed.
     * Returns 'pb' (pt-BR), 'pt' (pt-PT fallback), or null (none installed).
     */
    async detectTargetCode(): Promise<'pb' | 'pt' | null> {
        return new Promise((resolve) => {
            let output = '';
            const proc = spawn('python3', ['-c', CHECK_MODELS_SCRIPT], {
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
            proc.on('close', () => {
                const code = output.trim();
                if (code === 'pb' || code === 'pt') resolve(code);
                else resolve(null);
            });
        });
    }

    async areModelsInstalled(): Promise<boolean> {
        return (await this.detectTargetCode()) !== null;
    }

    // ─── Setup ────────────────────────────────────────────────────────────────

    /**
     * Installs the libretranslate pip package and a translation model.
     * Prefers the bundled pt-BR model (translate-en_pb-1_9.argosmodel) over
     * downloading pt-PT from the argostranslate index.
     * Bootstraps pip first if it is not available (Debian/Ubuntu systems).
     * Streams output to the terminal.
     */
    async runSetup(): Promise<void> {
        // Ensure pip is available before trying to install anything
        const pipOk = await this.isPipAvailable();
        if (!pipOk) {
            term.cyan('\n   pip não encontrado — instalando via bootstrap...\n');
            await this.runWithLiveOutput('python3', ['-c', BOOTSTRAP_PIP_SCRIPT]);
            term.green('   ✓ pip instalado!\n');
        }

        const packageInstalled = await this.isPackageInstalled();
        if (!packageInstalled) {
            term.cyan('\n   Instalando pacote Python (libretranslate)...\n');
            await this.runWithLiveOutput('python3', [
                '-m', 'pip', 'install', '--user', '--break-system-packages', 'libretranslate',
            ]);
            term.green('   ✓ Pacote instalado!\n');
        }

        const modelsInstalled = await this.areModelsInstalled();
        if (!modelsInstalled) {
            if (fs.existsSync(PTBR_MODEL_FILE)) {
                term.cyan('\n   Instalando modelo pt-BR do arquivo local...\n');
                await this.runWithLiveOutput('python3', ['-c', makeInstallPtBrScript(PTBR_MODEL_FILE)]);
                term.green('   ✓ Modelo pt-BR instalado!\n');
            } else {
                term.cyan('\n   Baixando modelo de tradução en→pt (~400MB, pode demorar)...\n');
                await this.runWithLiveOutput('python3', ['-c', INSTALL_PT_MODEL_SCRIPT]);
                term.green('   ✓ Modelo instalado!\n');
            }
        }
    }

    // ─── Start / stop ─────────────────────────────────────────────────────────

    /**
     * Spawns the LibreTranslate server and waits until it is ready to serve
     * HTTP requests. Resolves when the server responds on `/languages`.
     */
    async start(): Promise<void> {
        term.cyan(`\n🚀 Iniciando servidor LibreTranslate na porta ${this.port}...\n`);

        // Ensure ~/.local/bin is in PATH for user-installed packages
        const env = { ...process.env };
        const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
        const localBinPath = `${homeDir}/.local/bin`;
        if (env.PATH && !env.PATH.includes(localBinPath)) {
            env.PATH = `${localBinPath}:${env.PATH}`;
        }

        // Spawn the libretranslate command with arguments
        const cmd = 'libretranslate';
        const args = ['--port', String(this.port), '--host', this.host];

        this.serverProcess = spawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
        });

        // Stream server output dimmed so the user can follow startup progress
        const onData = (data: Buffer): void => {
            const lines = data.toString().split('\n').filter((l) => l.trim());
            for (const line of lines) {
                term.gray(`   ${line}\n`);
            }
        };
        this.serverProcess.stdout?.on('data', onData);
        this.serverProcess.stderr?.on('data', onData);

        this.serverProcess.on('error', (err) => {
            term.red(`\n✗ Erro ao iniciar LibreTranslate: ${err.message}\n`);
        });

        // Wait for HTTP readiness
        await this.waitForReady();

        // Detect which model code is active for use in translation calls
        const code = await this.detectTargetCode();
        this.activeTargetCode = code ?? 'pt';

        const modelLabel = this.activeTargetCode === 'pb'
            ? 'pt-BR (Portuguese Brazil)'
            : 'pt (Portuguese — fallback)';
        term.green(`   ✓ Servidor pronto em ${this.url}\n`);
        term.green(`   ✓ Modelo ativo: ${modelLabel}\n`);
    }

    /**
     * Sends SIGTERM to the server process. Safe to call even if server was
     * never started or already stopped.
     */
    stop(): void {
        if (this.serverProcess && !this.serverProcess.killed) {
            this.serverProcess.kill('SIGTERM');
            this.serverProcess = null;
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private async waitForReady(timeoutMs = 180_000): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        let dots = 0;
        let lastError = '';

        while (Date.now() < deadline) {
            try {
                const response = await axios.get(`${this.url}/languages`, {
                    timeout: 3_000,
                    validateStatus: () => true, // Accept any status code
                });
                if (response.status === 200) {
                    return;
                }
            } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
            }

            // Show a simple waiting indicator
            const indicator = '.'.repeat((dots % 3) + 1).padEnd(3, ' ');
            process.stdout.write(`\r   ⏳ Aguardando servidor${indicator}`);
            dots++;
            await new Promise((r) => setTimeout(r, 1_000));
        }

        process.stdout.write('\n');
        throw new Error(
            `LibreTranslate não respondeu em ${timeoutMs / 1000}s. ` +
            `Verifique se a porta ${this.port} está disponível. ` +
            `Último erro: ${lastError}`,
        );
    }

    private runWithLiveOutput(cmd: string, args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

            const onData = (data: Buffer): void => {
                const lines = data.toString().split('\n').filter((l) => l.trim());
                for (const line of lines) {
                    term.gray(`   ${line}\n`);
                }
            };

            proc.stdout?.on('data', onData);
            proc.stderr?.on('data', onData);

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Comando falhou com código ${code}: ${cmd} ${args.join(' ')}`));
                }
            });

            proc.on('error', reject);
        });
    }
}
