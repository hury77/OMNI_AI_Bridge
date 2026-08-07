import fs from 'fs';
import path from 'path';
import { isRestrictedFile, scanContentForSecrets } from './security.js';

export interface ContextFileMeta {
  path: string;
  included: boolean;
  size?: number;
  reason?: string;
}

export interface ContextBuilderOptions {
  cwd: string;
  targetFile?: string;
  contextFiles?: string[];
  contextDir?: string;
  ignorePatterns?: string[];
}

export interface ContextBuilderResult {
  targetContent?: string;
  targetFile?: string;
  contextString: string;
  contextFilesMeta: ContextFileMeta[];
}

export class SecurityBlockError extends Error {
  public type: string;
  constructor(message: string, type: string = 'security_blocked') {
    super(message);
    this.name = 'SecurityBlockError';
    this.type = type;
  }
}

const MAX_CONTEXT_FILES = 20;
const MAX_CONTEXT_KB = 500 * 1024; // 500 KB
const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

export function buildContext(options: ContextBuilderOptions): ContextBuilderResult {
  const { cwd, targetFile, contextFiles = [], contextDir, ignorePatterns = [] } = options;
  const contextFilesMeta: ContextFileMeta[] = [];
  let targetContent: string | undefined;

  // 1. Process targetFile
  if (targetFile) {
    const fullPath = path.resolve(cwd, targetFile);
    if (!fullPath.startsWith(cwd)) {
      throw new Error(`File path must be within the current working directory.`);
    }

    const fileName = path.basename(fullPath);
    if (isRestrictedFile(fileName)) {
      throw new Error(`Security violation. Cannot include restricted file: ${fileName}`);
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    const stats = fs.statSync(fullPath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File is too large (>1MB): ${fullPath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const secretResult = scanContentForSecrets(content);
    if (secretResult.found) {
      throw new SecurityBlockError(`Security violation. Found potential secret (${secretResult.type}) in target file.`, secretResult.type);
    }
    targetContent = content;
  }

  // 2. Collect files from contextFiles and contextDir
  const collectedPaths = new Set<string>();

  // Helper to check if file is ignored
  function isIgnored(itemName: string, relPath: string): boolean {
    if (isRestrictedFile(itemName)) {
      return true;
    }

    return ignorePatterns.some(pattern => {
      if (pattern === itemName) return true;
      const pathParts = relPath.split(path.sep);
      if (pathParts.includes(pattern)) return true;
      return false;
    });
  }

  if (contextFiles.length > 0) {
    for (const file of contextFiles) {
      const fullPath = path.resolve(cwd, file);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        collectedPaths.add(fullPath);
      } else {
        contextFilesMeta.push({
          path: path.relative(cwd, fullPath) || file,
          included: false,
          reason: 'not_found'
        });
      }
    }
  }

  if (contextDir) {
    const fullDir = path.resolve(cwd, contextDir);
    if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
      const walk = (currentDir: string) => {
        let entries;
        try {
          entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch (e) {
          return;
        }

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(cwd, fullPath);

          if (isIgnored(entry.name, relPath)) {
            // we do not record ignored dir contents, maybe just record if they were directly asked?
            // Since it's a directory scan, recording thousands of node_modules is a bad idea.
            // So we just skip.
            continue;
          }

          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            collectedPaths.add(fullPath);
          }
        }
      };
      walk(fullDir);
    } else {
      contextFilesMeta.push({
        path: path.relative(cwd, fullDir) || contextDir,
        included: false,
        reason: 'dir_not_found'
      });
    }
  }

  // 3. Process collected files (sort deterministically)
  const sortedPaths = Array.from(collectedPaths).sort();
  
  // Exclude target file from context files if it accidentally got collected
  const targetFullPath = targetFile ? path.resolve(cwd, targetFile) : undefined;
  
  const filesToProcess = sortedPaths.filter(p => p !== targetFullPath);

  let totalSize = 0;
  let includedCount = 0;
  const contextStrings: string[] = [];

  for (const fullPath of filesToProcess) {
    const relPath = path.relative(cwd, fullPath);
    const fileName = path.basename(fullPath);

    // Initial checks for each file
    if (isIgnored(fileName, relPath)) {
       contextFilesMeta.push({ path: relPath, included: false, reason: 'ignored' });
       continue;
    }

    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch (e) {
      contextFilesMeta.push({ path: relPath, included: false, reason: 'read_error' });
      continue;
    }

    if (stats.size > MAX_FILE_SIZE) {
      contextFilesMeta.push({ path: relPath, included: false, reason: 'size_limit_exceeded (over 1MB)', size: stats.size });
      continue;
    }

    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch (e) {
      contextFilesMeta.push({ path: relPath, included: false, reason: 'read_error', size: stats.size });
      continue;
    }

    const secretResult = scanContentForSecrets(content);
    if (secretResult.found) {
      contextFilesMeta.push({ path: relPath, included: false, reason: `security_blocked (${secretResult.type})`, size: stats.size });
      continue;
    }

    // Capacity checks
    if (includedCount >= MAX_CONTEXT_FILES) {
      contextFilesMeta.push({ path: relPath, included: false, reason: 'limit_exceeded (max_files)', size: stats.size });
      continue;
    }

    if (totalSize + stats.size > MAX_CONTEXT_KB) {
      contextFilesMeta.push({ path: relPath, included: false, reason: 'limit_exceeded (total_kb)', size: stats.size });
      continue;
    }

    // Success
    includedCount++;
    totalSize += stats.size;
    contextFilesMeta.push({ path: relPath, included: true, size: stats.size });
    
    contextStrings.push(`File: ${relPath}\n---\n${content}\n---`);
  }

  const contextString = contextStrings.join('\n\n');

  return {
    targetContent,
    targetFile: targetFile ? path.relative(cwd, path.resolve(cwd, targetFile)) : undefined,
    contextString,
    contextFilesMeta
  };
}
