import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { getGitInfo } from './git-info.js';
import { AIProvider } from '../providers/ai-provider.interface.js';
import { MockProvider } from '../providers/mock.provider.js';
import { OllamaProvider } from '../providers/ollama.provider.js';
import { buildContext, SecurityBlockError, ContextFileMeta } from './context-builder.js';

export { SecurityBlockError };

export interface SetupRunContextOptions {
  commandName: string;
  file?: string;
  files?: string[];
  dir?: string;
  providerOverride?: string;
  modelOverride?: string;
  prompt: string;
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
  
  // Ensure run directory exists early so we can save 'blocked' result if needed
  fs.mkdirSync(runsDir, { recursive: true });

  const basePayload = {
    timestamp: now.toISOString(),
    prompt: options.prompt,
    providerName: provider.name,
    model: modelName,
    ...gitInfo
  };

  const saveResult = (partialPayload: Record<string, any>) => {
    // partialPayload overwrites basePayload properties if there is a conflict (e.g. status)
    const finalPayload = {
      ...basePayload,
      ...partialPayload
    };
    fs.writeFileSync(resultPath, JSON.stringify(finalPayload, null, 2), 'utf8');
    return finalPayload;
  };

  // Build Context
  let contextResult;
  try {
    contextResult = buildContext({
      cwd,
      targetFile: options.file,
      contextFiles: options.files,
      contextDir: options.dir,
      ignorePatterns: config?.context?.ignore_patterns || []
    });
  } catch (error: any) {
    if (error instanceof SecurityBlockError) {
      saveResult({
        status: "blocked",
        detectedSecretType: error.type,
        response: null
      });
    }
    throw error;
  }

  const { targetContent, targetFile, contextString, contextFilesMeta } = contextResult;

  // Print warnings for omitted files
  const omitted = contextFilesMeta.filter(f => !f.included);
  if (omitted.length > 0) {
    console.log(chalk.yellow(`\n[WARNING] ${omitted.length} file(s) were omitted from context.`));
    omitted.forEach(f => {
      console.log(chalk.yellow(`  - ${f.path} (${f.reason})`));
    });
    console.log('');
  }

  // Update base payload with files info so that all subsequent saveResult calls include it
  Object.assign(basePayload, {
    ...(targetFile ? { targetFile } : {}),
    ...(contextFilesMeta.length > 0 ? { contextFiles: contextFilesMeta } : {})
  });

  return {
    provider,
    modelName,
    timestamp,
    runsDir,
    resultPath,
    targetContent,
    targetFile,
    contextString,
    contextFilesMeta,
    saveResult
  };
}
