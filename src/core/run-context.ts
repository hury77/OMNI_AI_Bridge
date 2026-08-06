import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { getGitInfo } from './git-info.js';
import { isRestrictedFile, scanContentForSecrets } from './security.js';
import { AIProvider } from '../providers/ai-provider.interface.js';
import { MockProvider } from '../providers/mock.provider.js';
import { OllamaProvider } from '../providers/ollama.provider.js';

export interface SetupRunContextOptions {
  commandName: string;
  file: string;
  providerOverride?: string;
  modelOverride?: string;
  prompt: string;
}

export class SecurityBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityBlockError';
  }
}

export function setupRunContext(options: SetupRunContextOptions) {
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

  const providerName = options.providerOverride || config?.ai?.provider || "mock";
  const modelName = options.modelOverride || config?.ai?.model || "llama3:latest";
  const baseUrl = config?.ai?.baseUrl || "http://localhost:11434";

  // Init Provider
  let provider: AIProvider;
  if (providerName === 'ollama') {
    provider = new OllamaProvider(baseUrl, modelName);
  } else {
    if (providerName !== 'mock') {
      console.log(chalk.yellow(`WARNING: Unknown provider '${providerName}'. Falling back to 'mock'.`));
    }
    provider = new MockProvider();
  }

  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  
  const runsDir = path.join(cwd, '.omniqa', 'runs', `${timestamp}_${options.commandName}`);
  const resultPath = path.join(runsDir, 'result.json');
  
  const gitInfo = getGitInfo();
  const filePath = path.resolve(cwd, options.file);
  const contextFilePath = filePath;
  const fileName = path.basename(filePath);

  const basePayload = {
    timestamp: now.toISOString(),
    prompt: options.prompt,
    contextFile: contextFilePath,
    providerName: provider.name,
    model: modelName,
    ...gitInfo
  };

  const saveResult = (partialPayload: Record<string, any>) => {
    fs.mkdirSync(runsDir, { recursive: true });
    // partialPayload overwrites basePayload properties if there is a conflict (e.g. status)
    const finalPayload = {
      ...basePayload,
      ...partialPayload
    };
    fs.writeFileSync(resultPath, JSON.stringify(finalPayload, null, 2), 'utf8');
    return finalPayload;
  };

  // Security checks
  if (!filePath.startsWith(cwd)) {
    throw new Error(`File path must be within the current working directory.`);
  }

  if (isRestrictedFile(fileName)) {
    throw new Error(`Security violation. Cannot include restricted file: ${fileName}`);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size > 1024 * 1024) {
    throw new Error(`File is too large (>1MB): ${filePath}`);
  }

  const contextContent = fs.readFileSync(filePath, 'utf8');
  
  const scanResult = scanContentForSecrets(contextContent);
  if (scanResult.found) {
    saveResult({
      status: "blocked",
      detectedSecretType: scanResult.type,
      response: null
    });
    throw new SecurityBlockError(`Security violation. Found potential secret (${scanResult.type}) in context file.`);
  }

  // Ensure run directory exists for caller to write additional files (like proposed.diff)
  fs.mkdirSync(runsDir, { recursive: true });

  return {
    provider,
    modelName,
    timestamp,
    runsDir,
    resultPath,
    contextContent,
    fileName,
    saveResult
  };
}
