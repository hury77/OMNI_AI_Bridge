import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import { MockProvider } from '../providers/mock.provider.js';
import { OllamaProvider } from '../providers/ollama.provider.js';
import { AIProvider } from '../providers/ai-provider.interface.js';
import { isRestrictedFile, scanContentForSecrets } from '../core/security.js';
import { getGitInfo } from '../core/git-info.js';

export const askCommand = new Command('ask')
  .description('Ask the AI a question')
  .argument('<question>', 'The question you want to ask')
  .option('-p, --provider <name>', 'Override AI provider')
  .option('-m, --model <name>', 'Override AI model')
  .option('-f, --file <path>', 'Include a file as context')
  .option('--dry-run', 'Build prompt and validate, but skip sending to AI provider')
  .action(async (question: string, options: { provider?: string, model?: string, file?: string, dryRun?: boolean }) => {
    const cwd = process.cwd();
    let config = loadConfig(cwd);

    if (!config) {
      console.log(chalk.yellow('WARNING: omniqa.yaml not found. Using default secure configuration.'));
      config = {
        ai: {
          provider: "mock",
          model: "llama3:latest",
          baseUrl: "http://localhost:11434"
        }
      };
    }

    const providerName = options.provider || config?.ai?.provider || "mock";
    const modelName = options.model || config?.ai?.model || "llama3:latest";
    const baseUrl = config?.ai?.baseUrl || "http://localhost:11434";

    let contextContent: string | undefined = undefined;
    let contextFilePath: string | null = null;

    // Set up timestamp and directories for logging
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const runsDir = path.join(cwd, '.omniqa', 'runs', `${timestamp}_ask`);
    const resultPath = path.join(runsDir, 'result.json');
    
    const gitInfo = getGitInfo();

    if (options.file) {
      const filePath = path.resolve(cwd, options.file);
      
      // Security: Path traversal check
      if (!filePath.startsWith(cwd)) {
        console.error(chalk.red(`ERROR: File path must be within the current working directory.`));
        process.exit(1);
      }

      // Security: Critical files check using unified security helper
      const fileName = path.basename(filePath);
      if (isRestrictedFile(fileName)) {
        console.error(chalk.red(`ERROR: Security violation. Cannot include restricted file: ${fileName}`));
        process.exit(1);
      }

      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`ERROR: File not found: ${filePath}`));
        process.exit(1);
      }

      const stats = fs.statSync(filePath);
      if (stats.size > 1024 * 1024) { // 1MB limit
        console.error(chalk.red(`ERROR: File is too large (>1MB): ${filePath}`));
        process.exit(1);
      }

      contextContent = fs.readFileSync(filePath, 'utf8');
      contextFilePath = filePath;
      
      // Security: Content secret scanning
      const scanResult = scanContentForSecrets(contextContent);
      if (scanResult.found) {
        fs.mkdirSync(runsDir, { recursive: true });
        const blockedPayload = {
          timestamp: now.toISOString(),
          prompt: question,
          contextFile: contextFilePath,
          providerName: providerName,
          model: modelName,
          status: "blocked",
          detectedSecretType: scanResult.type,
          response: null,
          ...gitInfo
        };
        fs.writeFileSync(resultPath, JSON.stringify(blockedPayload, null, 2), 'utf8');

        console.error(chalk.red(`ERROR: Security violation. Found potential secret (${scanResult.type}) in context file.`));
        console.log(chalk.dim(`\n[Saved blocked event to .omniqa/runs/${timestamp}_ask/result.json]`));
        process.exit(1);
      }

      console.log(chalk.yellow(`Attached context from: ${options.file}`));
    }

    if (options.dryRun) {
      console.log(chalk.cyan(`\n[DRY RUN] Final Prompt:`));
      let finalPrompt = question;
      if (contextContent) {
        finalPrompt += `\n\n--- Context from ${options.file} ---\n${contextContent}`;
      }
      console.log(chalk.cyan(finalPrompt));

      fs.mkdirSync(runsDir, { recursive: true });
      const dryRunPayload = {
        timestamp: now.toISOString(),
        prompt: question,
        contextFile: contextFilePath,
        providerName: providerName,
        model: modelName,
        status: "dry-run",
        response: null,
        ...gitInfo
      };
      fs.writeFileSync(resultPath, JSON.stringify(dryRunPayload, null, 2), 'utf8');
      console.log(chalk.dim(`\n[Saved dry-run event to .omniqa/runs/${timestamp}_ask/result.json]`));
      return;
    }

    console.log(chalk.dim(`User: ${question}`));

    let provider: AIProvider;
    if (providerName === 'ollama') {
      provider = new OllamaProvider(baseUrl, modelName);
    } else {
      if (providerName !== 'mock') {
        console.log(chalk.yellow(`WARNING: Unknown provider '${providerName}'. Falling back to 'mock'.`));
      }
      provider = new MockProvider();
    }
    
    fs.mkdirSync(runsDir, { recursive: true });

    try {
      const response = await provider.send({ prompt: question, context: contextContent });
      console.log(chalk.green(`\nAI (${provider.name} - ${modelName}):\n${response.text}`));

      const resultPayload = {
        timestamp: now.toISOString(),
        prompt: question,
        contextFile: contextFilePath,
        providerName: provider.name,
        model: modelName,
        status: "success",
        response: response,
        ...gitInfo
      };

      fs.writeFileSync(resultPath, JSON.stringify(resultPayload, null, 2), 'utf8');
      console.log(chalk.dim(`\n[Saved run log to .omniqa/runs/${timestamp}_ask/result.json]`));

    } catch (error) {
      console.error(chalk.red(`\nError communicating with provider: ${(error as Error).message}`));
      
      const errorPayload = {
        timestamp: now.toISOString(),
        prompt: question,
        contextFile: contextFilePath,
        providerName: provider.name,
        model: modelName,
        status: "error",
        error: (error as Error).message,
        ...gitInfo
      };

      fs.writeFileSync(resultPath, JSON.stringify(errorPayload, null, 2), 'utf8');
      console.log(chalk.dim(`\n[Saved error log to .omniqa/runs/${timestamp}_ask/result.json]`));
      
      process.exit(1);
    }
  });
