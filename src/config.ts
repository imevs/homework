import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from './types.ts';

  function getEnvFilePath(): string | null {
    // 1. Check CLI arguments: --env-file=<path> or --config=<path>
    for (let i = 0; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg.startsWith('--env-file=')) return arg.split('=')[1];
      if (arg.startsWith('--config=')) return arg.split('=')[1];
      if (arg.startsWith('--env=')) return arg.split('=')[1];
      if ((arg === '--env-file' || arg === '--config' || arg === '--env') && process.argv[i + 1]) {
        return process.argv[i + 1];
      }
    }

    // 2. Check environment variables
    if (process.env.ENV_FILE) return process.env.ENV_FILE;
    if (process.env.CONFIG_FILE) return process.env.CONFIG_FILE;

    // 3. Default fallback to .env if present
    if (fs.existsSync('.env')) return '.env';

    return null;
  }

  // Load env file if found
  const envPath = getEnvFilePath();
  if (envPath && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        val = val.replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }

  export const CONFIG: AppConfig = {
    url: 'https://www.e-klase.lv',
    username: process.env.EKLASE_USER || '',
    password: process.env.EKLASE_PASSWORD || '',
    targetProfiles: [
      { className: '4.c', schoolName: 'Rīgas 40. vidusskola', label: '4.c, Rīgas 40. vidusskola' },
      { className: '1.a', schoolName: 'Rīgas 40. vidusskola', label: '1.a, Rīgas 40. vidusskola' },
      { className: '4.c', schoolName: 'Aizgādņu biedrība ASSOR', label: '4.c, Aizgādņu biedrība ASSOR' },
      { className: '1.a', schoolName: 'Aizgādņu biedrība ASSOR', label: '1.a, Aizgādņu biedrība ASSOR' },
    ],
    headless: process.env.HEADLESS !== 'false',
    timeout: 30000,
    outputJson: 'homework.json',
    outputMarkdown: 'homework.md',
    outputHtml: 'homework.html',
    attachmentsDir: path.resolve('attachments'),
  };

