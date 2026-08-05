import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import { scanDirectory } from '../core/scanner.js';

export const scanCommand = new Command('scan')
  .description('Scan the project and generate project-manifest.json')
  .action(async () => {
    const cwd = process.cwd();
    let config = loadConfig(cwd);

    if (!config) {
      console.warn('WARNING: omniqa.yaml not found. Using default secure configuration.');
      config = {
        context: {
          ignore_patterns: [
            "node_modules",
            ".git",
            ".omniqa",
            "dist",
            "build"
          ]
        }
      };
    }

    console.log('Scanning project directory...');
    const result = await scanDirectory(cwd, config.context.ignore_patterns);

    const manifest = {
      generatedAt: new Date().toISOString(),
      root: ".",
      summary: {
        totalFiles: result.files.length,
        totalSizeBytes: result.files.reduce((acc, f) => acc + f.size, 0),
        excludedCount: result.excludedCount,
        filesWithSecretWarnings: result.filesWithSecretWarnings
      },
      files: result.files
    };

    const dotOmniqaIndexPath = path.join(cwd, '.omniqa', 'index');
    if (!fs.existsSync(dotOmniqaIndexPath)) {
      fs.mkdirSync(dotOmniqaIndexPath, { recursive: true });
    }

    const manifestPath = path.join(dotOmniqaIndexPath, 'project-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log('\nScan Summary:');
    console.log(`- Total Files: ${manifest.summary.totalFiles}`);
    console.log(`- Total Size: ${(manifest.summary.totalSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`- Excluded Files/Directories: ${manifest.summary.excludedCount}`);
    console.log(`\nManifest saved to .omniqa/index/project-manifest.json`);

    if (manifest.summary.filesWithSecretWarnings > 0) {
      console.log(chalk.yellow(`\n⚠ Found potential secrets in ${manifest.summary.filesWithSecretWarnings} file(s). See manifest for details.`));
    }
  });
