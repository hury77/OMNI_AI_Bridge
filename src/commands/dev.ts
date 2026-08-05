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
import { sanitizeAIOutput, generateUnifiedDiff } from '../core/diff-generator.js';

export const devCommand = new Command('dev')
  .description('Ask AI to modify a file and generate a patch')
  .argument('<task>', 'Description of what needs to be changed')
  .requiredOption('-f, --file <path>', 'The file to modify (required)')
  .option('-p, --provider <name>', 'Override AI provider')
  .option('-m, --model <name>', 'Override AI model')
  .action(async (task: string, options: { provider?: string, model?: string, file: string }) => {
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

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const runsDir = path.join(cwd, '.omniqa', 'runs', `${timestamp}_dev`);
    const resultPath = path.join(runsDir, 'result.json');
    const diffPath = path.join(runsDir, 'proposed.diff');
    
    const gitInfo = getGitInfo();

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

    const contextContent = fs.readFileSync(filePath, 'utf8');
    const contextFilePath = filePath;
    
    // Security: Content secret scanning
    const scanResult = scanContentForSecrets(contextContent);
    if (scanResult.found) {
      fs.mkdirSync(runsDir, { recursive: true });
      const blockedPayload = {
        timestamp: now.toISOString(),
        prompt: task,
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
      console.log(chalk.dim(`\n[Saved blocked event to .omniqa/runs/${timestamp}_dev/result.json]`));
      process.exit(1);
    }

    console.log(chalk.yellow(`Attached target file: ${options.file}`));
    console.log(chalk.dim(`Task: ${task}`));

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

    // Build Prompt with System Instruction
    const systemInstruction = `[SYSTEM]: You are an automated code editor. You must return ONLY the complete, fully updated content of the file. Do not include any explanations, greetings, or markdown code blocks (like \`\`\`). Preserve the original code style, indentation, and formatting except where the requested change requires otherwise. Provide the raw text exactly as it should be saved.`;
    const fullPrompt = `${systemInstruction}\n\nTask:\n${task}\n\nFile Content to modify:\n${contextContent}`;

    try {
      const response = await provider.send({ prompt: fullPrompt, context: undefined });
      
      const newContent = sanitizeAIOutput(response.text);

      if (newContent.trim() === contextContent.trim()) {
        // No changes
        const resultPayload = {
          timestamp: now.toISOString(),
          prompt: task,
          contextFile: contextFilePath,
          providerName: provider.name,
          model: modelName,
          status: "no-changes",
          response: { summary: "AI returned identical content. No diff generated." },
          ...gitInfo
        };
        fs.writeFileSync(resultPath, JSON.stringify(resultPayload, null, 2), 'utf8');
        
        console.log(chalk.cyan(`\nStatus: No changes detected.`));
        console.log(chalk.dim(`[Saved run log to .omniqa/runs/${timestamp}_dev/result.json]`));
      } else {
        // Generate Diff
        const patch = generateUnifiedDiff(contextContent, newContent, fileName);
        fs.writeFileSync(diffPath, patch, 'utf8');

        const resultPayload = {
          timestamp: now.toISOString(),
          prompt: task,
          contextFile: contextFilePath,
          providerName: provider.name,
          model: modelName,
          status: "success",
          diffPath: diffPath,
          response: { summary: "Diff generated successfully." },
          ...gitInfo
        };
        fs.writeFileSync(resultPath, JSON.stringify(resultPayload, null, 2), 'utf8');

        console.log(chalk.green(`\nPatch generated successfully!`));
        console.log(chalk.yellow(`Review the diff in .omniqa/runs/${timestamp}_dev/proposed.diff and apply manually — 'omniqa apply' is not yet implemented.`));
        console.log(chalk.dim(`\n[Saved run log to .omniqa/runs/${timestamp}_dev/result.json]`));
      }

    } catch (error) {
      console.error(chalk.red(`\nError communicating with provider: ${(error as Error).message}`));
      
      const errorPayload = {
        timestamp: now.toISOString(),
        prompt: task,
        contextFile: contextFilePath,
        providerName: provider.name,
        model: modelName,
        status: "error",
        error: (error as Error).message,
        ...gitInfo
      };

      fs.writeFileSync(resultPath, JSON.stringify(errorPayload, null, 2), 'utf8');
      console.log(chalk.dim(`\n[Saved error log to .omniqa/runs/${timestamp}_dev/result.json]`));
      
      process.exit(1);
    }
  });
