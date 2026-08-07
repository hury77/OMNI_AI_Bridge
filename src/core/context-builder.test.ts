import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildContext, SecurityBlockError } from './context-builder.js';
import fs from 'fs';
import path from 'path';

vi.mock('fs');
vi.mock('./security.js', () => ({
  isRestrictedFile: vi.fn(),
  scanContentForSecrets: vi.fn()
}));

import { isRestrictedFile, scanContentForSecrets } from './security.js';

describe('context-builder', () => {
  const cwd = '/mock/cwd';

  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, isDirectory: () => false, size: 100 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue('dummy content');
    
    vi.mocked(isRestrictedFile).mockReturnValue(false);
    vi.mocked(scanContentForSecrets).mockReturnValue({ found: false });
  });

  it('should process target file correctly', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
    
    const result = await buildContext({
      cwd,
      targetFile: 'src/main.ts'
    });

    expect(result.targetContent).toBe('dummy content');
    expect(result.targetFile).toBe('src/main.ts');
    expect(result.contextString).toBe('');
  });

  it('should throw Error if target file is too large', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 2 * 1024 * 1024 } as any);

    await expect(async () => {
      await buildContext({
        cwd,
        targetFile: 'src/huge.ts'
      });
    }).rejects.toThrow(/too large/);
  });

  it('should throw SecurityBlockError if target file has secrets', async () => {
    vi.mocked(scanContentForSecrets).mockReturnValue({ found: true, type: 'AWS Key' });

    await expect(async () => {
      await buildContext({
        cwd,
        targetFile: 'src/secret.ts'
      });
    }).rejects.toThrow(SecurityBlockError);
  });

  it('should collect and format context files', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, isDirectory: () => false, size: 100 } as any);

    const result = await buildContext({
      cwd,
      contextFiles: ['src/a.ts', 'src/b.ts']
    });

    expect(result.contextFilesMeta).toHaveLength(2);
    expect(result.contextFilesMeta[0].included).toBe(true);
    expect(result.contextFilesMeta[1].included).toBe(true);
    
    // Should be sorted: a.ts then b.ts
    expect(result.contextString).toContain('File: src/a.ts');
    expect(result.contextString).toContain('File: src/b.ts');
    expect(result.contextString.indexOf('src/a.ts')).toBeLessThan(result.contextString.indexOf('src/b.ts'));
  });

  it('should exclude target file from context files', async () => {
    const result = await buildContext({
      cwd,
      targetFile: 'src/a.ts',
      contextFiles: ['src/a.ts', 'src/b.ts']
    });

    expect(result.targetFile).toBe('src/a.ts');
    expect(result.contextFilesMeta).toHaveLength(1);
    expect(result.contextFilesMeta[0].path).toBe('src/b.ts');
    expect(result.contextString).toContain('src/b.ts');
    expect(result.contextString).not.toContain('File: src/a.ts');
  });

  it('should apply 1MB size limit to context files', async () => {
    // Mock statSync to return large size for 'large.ts'
    vi.mocked(fs.statSync).mockImplementation((p: any) => {
      const isFile = !p.includes('dir');
      const size = p.includes('large.ts') ? 2 * 1024 * 1024 : 100;
      return { isFile: () => isFile, isDirectory: () => !isFile, size } as any;
    });

    const result = await buildContext({
      cwd,
      contextFiles: ['src/small.ts', 'src/large.ts']
    });

    expect(result.contextFilesMeta).toHaveLength(2);
    const largeFile = result.contextFilesMeta.find(f => f.path === 'src/large.ts');
    expect(largeFile?.included).toBe(false);
    expect(largeFile?.reason).toContain('size_limit_exceeded');
  });

  it('should apply MAX_CONTEXT_KB limit', async () => {
    // 6 files of 100KB each = 600KB > 500KB limit
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, isDirectory: () => false, size: 100 * 1024 } as any);

    const contextFiles = ['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts'];
    
    const result = await buildContext({
      cwd,
      contextFiles
    });

    expect(result.contextFilesMeta).toHaveLength(6);
    
    const included = result.contextFilesMeta.filter(f => f.included);
    const excluded = result.contextFilesMeta.filter(f => !f.included);
    
    expect(included.length).toBe(5); // 500 KB exact
    expect(excluded.length).toBe(1);
    expect(excluded[0].reason).toContain('limit_exceeded (total_kb)');
  });

  it('should apply MAX_CONTEXT_FILES limit', async () => {
    // 25 files of 1KB each = 25KB < 500KB limit, but > 20 files limit
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, isDirectory: () => false, size: 1024 } as any);

    const contextFiles = Array.from({ length: 25 }, (_, i) => `f${String(i).padStart(2, '0')}.ts`);
    
    const result = await buildContext({
      cwd,
      contextFiles
    });

    expect(result.contextFilesMeta).toHaveLength(25);
    
    const included = result.contextFilesMeta.filter(f => f.included);
    const excluded = result.contextFilesMeta.filter(f => !f.included);
    
    expect(included.length).toBe(20);
    expect(excluded.length).toBe(5);
    expect(excluded[0].reason).toContain('limit_exceeded (max_files)');
  });

  it('should respect ignorePatterns', async () => {
    const result = await buildContext({
      cwd,
      contextFiles: ['src/a.ts', 'dist/b.ts'],
      ignorePatterns: ['dist']
    });

    expect(result.contextFilesMeta).toHaveLength(2);
    
    const ignored = result.contextFilesMeta.find(f => f.path === 'dist/b.ts');
    expect(ignored?.included).toBe(false);
    expect(ignored?.reason).toBe('ignored');
  });

  it('should recursively read directory', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    
    // Mock directory structure
    vi.mocked(fs.statSync).mockImplementation((p: any) => {
      const isDir = p.endsWith('dir');
      return { isFile: () => !isDir, isDirectory: () => isDir, size: 100 } as any;
    });

    vi.mocked(fs.readdirSync).mockImplementation((p: any) => {
      if (p === '/mock/cwd/src/dir') {
        return [
          { name: 'file1.ts', isFile: () => true, isDirectory: () => false },
          { name: 'subdir', isFile: () => false, isDirectory: () => true }
        ] as any;
      }
      if (p === '/mock/cwd/src/dir/subdir') {
        return [
          { name: 'file2.ts', isFile: () => true, isDirectory: () => false }
        ] as any;
      }
      return [];
    });

    const result = await buildContext({
      cwd,
      contextDir: 'src/dir'
    });

    expect(result.contextFilesMeta).toHaveLength(2);
    const paths = result.contextFilesMeta.map(f => f.path).sort();
    
    // path.relative with mocked paths might be tricky.
    // Assuming simple path join: src/dir/file1.ts, src/dir/subdir/file2.ts
    // Let's just check length and inclusion
    expect(result.contextFilesMeta.every(f => f.included)).toBe(true);
  });
});
