import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { scanCommand } from './commands/scan.js';
import { askCommand } from './commands/ask.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json to get the version
const pkgPath = path.join(__dirname, '../../package.json');
let version = '1.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.version) version = pkg.version;
} catch (e) {
  // fallback to 1.0.0
}

const program = new Command();

program
  .name('omniqa')
  .description('OmniQA AI Bridge CLI')
  .version(version);

program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(askCommand);

program.parse(process.argv);
