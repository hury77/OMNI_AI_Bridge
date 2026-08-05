import fs from 'fs';
import path from 'path';
import { isRestrictedFile, scanContentForSecrets } from './security.js';

export interface FileMetadata {
  path: string;
  size: number;
  ext: string;
  securityWarning?: string;
}

export interface ScanResult {
  files: FileMetadata[];
  excludedCount: number;
  filesWithSecretWarnings: number;
}

export async function scanDirectory(
  rootDir: string,
  ignorePatterns: string[]
): Promise<ScanResult> {
  const result: ScanResult = { files: [], excludedCount: 0, filesWithSecretWarnings: 0 };
  
  const textExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml',
    '.md', '.txt', '.py', '.sh', '.cjs', '.mjs', '.vue', '.svelte'
  ]);
  
  // Simple substring/exact check for MVP 0.
  function isIgnored(itemName: string, relPath: string): boolean {
    if (isRestrictedFile(itemName)) {
      return true;
    }

    return ignorePatterns.some(pattern => {
      // Basic check: if the name is strictly the pattern or if path contains the pattern
      if (pattern === itemName) return true;
      
      // Handle paths formatted with separators
      const pathParts = relPath.split(path.sep);
      if (pathParts.includes(pattern)) return true;
      
      return false;
    });
  }

  async function walk(currentDir: string) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (isIgnored(entry.name, relPath)) {
        result.excludedCount++;
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          const ext = path.extname(entry.name);
          
          let securityWarning: string | undefined = undefined;

          // Only scan text files that are under 1MB
          if (textExtensions.has(ext) && stats.size <= 1024 * 1024) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const secretResult = scanContentForSecrets(content);
              if (secretResult.found) {
                securityWarning = secretResult.type;
                result.filesWithSecretWarnings++;
              }
            } catch (e) {
              // Ignore read errors
            }
          }

          result.files.push({
            path: relPath,
            size: stats.size,
            ext: ext,
            ...(securityWarning ? { securityWarning } : {})
          });
        } catch (e) {
          // Ignore files we can't stat
        }
      }
    }
  }

  await walk(rootDir);
  return result;
}
