#!/usr/bin/env node
/**
 * Quick launcher: prompts for Kibana credentials (if needed) then runs fetch-daily-logs.mjs
 * 
 * Usage:
 *   node run-report.mjs                    # Will prompt for creds if ES is unreachable
 *   KIBANA_WD_AUTH=user:pass node run-report.mjs  # Skip prompt
 */
import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, 'fetch-daily-logs.mjs');

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(r => rl.question(question, a => { rl.close(); r(a.trim()); }));
}

async function canReachES() {
  try {
    await fetch("http://172.31.66.65:9200/_cluster/health", { signal: AbortSignal.timeout(3000) });
    return true;
  } catch { return false; }
}

async function main() {
  let auth = process.env.KIBANA_WD_AUTH ?? process.env.KIBANA_AUTH;

  if (!auth) {
    const direct = await canReachES();
    if (!direct) {
      console.error("Cannot reach ES directly. Need Kibana LDAP credentials.\n");
      const user = await ask("Kibana username (LDAP): ");
      const pass = await ask("Kibana password: ");
      if (!user || !pass) { console.error("Credentials required."); process.exit(1); }
      auth = `${user}:${pass}`;
    }
  }

  const env = { ...process.env };
  if (auth) {
    env.KIBANA_WD_AUTH = auth;
    env.KIBANA_AUTH = auth;
  }

  const child = spawn(process.execPath, [scriptPath, ...process.argv.slice(2)], {
    env,
    stdio: 'inherit',
  });
  child.on('exit', code => process.exit(code ?? 1));
}

main();
