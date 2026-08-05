import fs from 'fs';
import path from 'path';
import { isRestrictedFile } from './security.js';

export interface FileMetadata {
  path: string;
  size: number;
  ext: string;
}

export interface ScanResult {
  files: FileMetadata[];
  excludedCount: number;
}

export async function scanDirectory(
  rootDir: string,
  ignorePatterns: string[]
): Promise<ScanResult> {
  const result: ScanResult = { files: [], excludedCount: 0 };
  
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
          result.files.push({
            path: relPath,
            size: stats.size,
            ext: path.extname(entry.name)
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
