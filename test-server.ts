import { spawn } from 'child_process';
import axios from 'axios';

async function test() {
    console.log('Iniciando servidor...');
    const proc = spawn('libretranslate', ['--port', '7777', '--host', '127.0.0.1'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` }
    });
    
    proc.stdout?.on('data', (d) => console.log('STDOUT:', d.toString().slice(0, 100)));
    proc.stderr?.on('data', (d) => console.log('STDERR:', d.toString().slice(0, 100)));
    
    console.log('Aguardando 5 segundos...');
    await new Promise(r => setTimeout(r, 5000));
    
    try {
        const res = await axios.get('http://127.0.0.1:7777/languages', { timeout: 3000 });
        console.log('✓ Servidor respondeu:', res.status);
    } catch (e) {
        console.log('✗ Servidor não respondeu:', e instanceof Error ? e.message : e);
    }
    
    proc.kill();
    console.log('Processo finalizado');
}

test();
