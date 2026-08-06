import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class PatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchValidationError';
  }
}

export class PatchGitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchGitError';
  }
}

export interface PatchStats {
  added: number;
  removed: number;
  targetFile: string | null;
}

export interface RunValidationResult {
  diffPath: string;
  resultJsonPath: string;
  diffContent: string;
}

export function validateRunForApply(runId: string, workspaceDir: string): RunValidationResult {
  // Security/Sanity: basic check that runId is just a folder name, not a path
  if (runId.includes('/') || runId.includes('\\')) {
    throw new PatchValidationError(`Invalid run-id format. Must be a folder name (e.g. 20260805_222043Z_dev), not a path.`);
  }

  const runDir = path.join(workspaceDir, '.omniqa', 'runs', runId);
  if (!fs.existsSync(runDir)) {
    throw new PatchValidationError(`Run directory not found: ${runDir}`);
  }

  const resultJsonPath = path.join(runDir, 'result.json');
  if (!fs.existsSync(resultJsonPath)) {
    throw new PatchValidationError(`Missing result.json in run directory.`);
  }

  const resultData = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));

  if (resultData.status !== 'success') {
    throw new PatchValidationError(`Cannot apply patch. Run status is '${resultData.status}'. Only 'success' runs can be applied.`);
  }

  if (resultData.appliedAt) {
    throw new PatchValidationError(`This patch was already applied on ${resultData.appliedAt}. Skipping to prevent conflicts.`);
  }

  if (!resultData.diffPath) {
    throw new PatchValidationError(`Cannot apply patch. No diffPath found in result.json.`);
  }

  const diffPath = path.resolve(workspaceDir, resultData.diffPath);
  if (!fs.existsSync(diffPath)) {
    throw new PatchValidationError(`Diff file not found at: ${diffPath}`);
  }

  const diffContent = fs.readFileSync(diffPath, 'utf8');

  return {
    diffPath,
    resultJsonPath,
    diffContent
  };
}

export function parseDiffStats(diffContent: string): PatchStats {
  let added = 0;
  let removed = 0;
  let targetFile: string | null = null;

  const lines = diffContent.split('\n');
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      // e.g. "--- path/to/file.ts"
      // Strip Original, etc. Just get the file name
      const parts = line.substring(4).split('\t');
      targetFile = parts[0].trim();
    } else if (line.startsWith('@@ ')) {
      inHunk = true;
    } else if (inHunk) {
      if (line.startsWith('+') && !line.startsWith('+++ ')) {
        added++;
      } else if (line.startsWith('-') && !line.startsWith('--- ')) {
        removed++;
      }
    }
  }

  return { added, removed, targetFile };
}

export function checkPatchApplicability(diffPath: string, cwd: string): void {
  try {
    execSync(`git apply --check -p0 "${diffPath}"`, { cwd, stdio: 'pipe' });
  } catch (error: any) {
    const errorMsg = error.stderr ? error.stderr.toString() : error.message;
    throw new PatchGitError(`Patch cannot be cleanly applied. Git reported:\n${errorMsg.trim()}`);
  }
}

export function applyPatch(diffPath: string, cwd: string): void {
  try {
    execSync(`git apply -p0 "${diffPath}"`, { cwd, stdio: 'pipe' });
  } catch (error: any) {
    const errorMsg = error.stderr ? error.stderr.toString() : error.message;
    throw new PatchGitError(`Failed to apply patch. Git reported:\n${errorMsg.trim()}`);
  }
}

export function markRunAsApplied(resultJsonPath: string): void {
  const resultData = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
  resultData.appliedAt = new Date().toISOString();
  fs.writeFileSync(resultJsonPath, JSON.stringify(resultData, null, 2), 'utf8');
}
