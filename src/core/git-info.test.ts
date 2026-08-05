import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGitInfo } from './git-info.js';
import * as child_process from 'child_process';

vi.mock('child_process');

describe('getGitInfo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return branch and commit hash when git commands succeed', () => {
    vi.mocked(child_process.execSync).mockImplementation((command: string) => {
      if (command.includes('--abbrev-ref HEAD')) {
        return Buffer.from('feature/awesome-branch\n');
      }
      if (command.includes('--short HEAD')) {
        return Buffer.from('a1b2c3d\n');
      }
      return Buffer.from('');
    });

    const info = getGitInfo();
    expect(info).toEqual({
      gitBranch: 'feature/awesome-branch',
      gitCommit: 'a1b2c3d'
    });
  });

  it('should return nulls when git command throws an error (e.g. not a git repo)', () => {
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    const info = getGitInfo();
    expect(info).toEqual({
      gitBranch: null,
      gitCommit: null
    });
  });
});
