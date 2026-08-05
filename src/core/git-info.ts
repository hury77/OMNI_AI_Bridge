import { execSync } from 'child_process';

export interface GitInfo {
  gitBranch: string | null;
  gitCommit: string | null;
}

export function getGitInfo(): GitInfo {
  try {
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
    const gitCommit = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
    return { gitBranch, gitCommit };
  } catch (error) {
    return { gitBranch: null, gitCommit: null };
  }
}
