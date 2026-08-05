import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanDirectory } from './scanner.js';
import fs from 'fs';

vi.mock('fs');

describe('scanner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should exclude built-in directories automatically', async () => {
    const mockFiles: Record<string, any[]> = {
      '/root': [
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: '.git', isDirectory: () => true, isFile: () => false },
        { name: '.omniqa', isDirectory: () => true, isFile: () => false },
        { name: 'src', isDirectory: () => true, isFile: () => false }
      ],
      '/root/src': [
        { name: 'index.ts', isDirectory: () => false, isFile: () => true }
      ]
    };

    vi.mocked(fs.readdirSync).mockImplementation((path: any) => mockFiles[path] || []);
    vi.mocked(fs.statSync).mockImplementation(() => ({ size: 100 } as any));

    const result = await scanDirectory('/root', ['node_modules', '.git', '.omniqa', 'dist', 'build']);
    
    // index.ts should be found
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/index.ts');
    // node_modules, .git, .omniqa excluded
    expect(result.excludedCount).toBe(3);
  });

  it('should correctly combine user ignore_patterns with built-in exclusions', async () => {
    const mockFiles: Record<string, any[]> = {
      '/root': [
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: 'custom_ignore_dir', isDirectory: () => true, isFile: () => false },
      ],
      '/root/src': [
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'ignored_file.log', isDirectory: () => false, isFile: () => true }
      ]
    };

    vi.mocked(fs.readdirSync).mockImplementation((path: any) => mockFiles[path] || []);
    vi.mocked(fs.statSync).mockImplementation(() => ({ size: 100 } as any));

    // 'custom_ignore_dir' and 'ignored_file.log' are custom ignores from omniqa.yaml
    const ignorePatterns = ['node_modules', 'custom_ignore_dir', 'ignored_file.log'];
    
    const result = await scanDirectory('/root', ignorePatterns);
    
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/index.ts');
    expect(result.excludedCount).toBe(3); // node_modules, custom_ignore_dir, ignored_file.log
  });

  it('should ALWAYS exclude files rejected by isRestrictedFile, even if missing from ignore_patterns', async () => {
    const mockFiles: Record<string, any[]> = {
      '/root': [
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: '.env', isDirectory: () => false, isFile: () => true },
        { name: 'pnpm-lock.yaml', isDirectory: () => false, isFile: () => true }
      ],
      '/root/src': [
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'secret.pem', isDirectory: () => false, isFile: () => true }
      ]
    };

    vi.mocked(fs.readdirSync).mockImplementation((path: any) => mockFiles[path] || []);
    vi.mocked(fs.statSync).mockImplementation(() => ({ size: 100 } as any));

    // ignorePatterns is empty, meaning the user didn't specify to ignore .env or lockfiles
    const result = await scanDirectory('/root', []);
    
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/index.ts');
    expect(result.excludedCount).toBe(3); // .env, pnpm-lock.yaml, secret.pem
  });

  it('should flag a file with securityWarning if it contains a secret and increment filesWithSecretWarnings', async () => {
    const mockFiles: Record<string, any[]> = {
      '/root': [
        { name: 'config.ts', isDirectory: () => false, isFile: () => true },
        { name: 'clean.ts', isDirectory: () => false, isFile: () => true }
      ]
    };

    vi.mocked(fs.readdirSync).mockImplementation((path: any) => mockFiles[path] || []);
    vi.mocked(fs.statSync).mockImplementation(() => ({ size: 500 } as any));
    
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path === '/root/config.ts') {
        return 'const key = "sk-abcdefghijklmnopqrstuvwxyz12345";';
      }
      return 'console.log("hello");';
    });

    const result = await scanDirectory('/root', []);
    
    expect(result.files).toHaveLength(2);
    expect(result.filesWithSecretWarnings).toBe(1);

    const config = result.files.find(f => f.path === 'config.ts');
    expect(config?.securityWarning).toBe('OpenAI-style key');

    const clean = result.files.find(f => f.path === 'clean.ts');
    expect(clean?.securityWarning).toBeUndefined();
  });

  it('should skip secret scanning for large files or non-text files', async () => {
    const mockFiles: Record<string, any[]> = {
      '/root': [
        { name: 'large-config.ts', isDirectory: () => false, isFile: () => true },
        { name: 'video.mp4', isDirectory: () => false, isFile: () => true }
      ]
    };

    vi.mocked(fs.readdirSync).mockImplementation((path: any) => mockFiles[path] || []);
    
    vi.mocked(fs.statSync).mockImplementation((path: any) => {
      if (path === '/root/large-config.ts') {
        return { size: 2 * 1024 * 1024 } as any; // 2MB
      }
      return { size: 500 } as any;
    });

    vi.mocked(fs.readFileSync).mockImplementation(() => 'const key = "sk-abcdefghijklmnopqrstuvwxyz12345";');

    const result = await scanDirectory('/root', []);
    
    expect(result.files).toHaveLength(2);
    expect(result.filesWithSecretWarnings).toBe(0);

    const large = result.files.find(f => f.path === 'large-config.ts');
    expect(large?.securityWarning).toBeUndefined();
    
    const video = result.files.find(f => f.path === 'video.mp4');
    expect(video?.securityWarning).toBeUndefined();
    
    // readFileSync should never be called because the files are filtered out
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });
});
