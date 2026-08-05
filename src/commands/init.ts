import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import yaml from 'yaml';
import { ensureDir } from '../utils/file-system.js';

export const initCommand = new Command('init')
  .description('Initialize OmniQA in the current directory')
  .action(async () => {
    const cwd = process.cwd();
    const configPath = path.join(cwd, 'omniqa.yaml');
    const dotOmniqaPath = path.join(cwd, '.omniqa');
    const dotOmniqaIndexPath = path.join(dotOmniqaPath, 'index');

    console.log('Initializing OmniQA...');

    // Create .omniqa/index directory
    if (fs.existsSync(dotOmniqaPath)) {
      console.log(`- Directory .omniqa already exists.`);
    } else {
      ensureDir(dotOmniqaPath);
      console.log(`- Created .omniqa directory.`);
    }

    if (fs.existsSync(dotOmniqaIndexPath)) {
      console.log(`- Directory .omniqa/index already exists.`);
    } else {
      ensureDir(dotOmniqaIndexPath);
      console.log(`- Created .omniqa/index directory.`);
    }

    // Create omniqa.yaml
    if (fs.existsSync(configPath)) {
      console.log(`- File omniqa.yaml already exists. Skipping creation.`);
    } else {
      const defaultConfig = {
        version: "1.0",
        project: {
          name: path.basename(cwd),
          type: "custom"
        },
        ai: {
          provider: "mock",
          model: "llama3:latest",
          baseUrl: "http://localhost:11434"
        },
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
      
      const yamlStr = yaml.stringify(defaultConfig);
      fs.writeFileSync(configPath, yamlStr, 'utf8');
      console.log(`- Created omniqa.yaml configuration file.`);
    }

    console.log('OmniQA initialized successfully.');
  });
