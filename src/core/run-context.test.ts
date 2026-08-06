import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupRunContext, SecurityBlockError } from './run-context.js';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('fs');
vi.mock('./config.js', () => ({
  loadConfig: vi.fn(() => null) // Default to no config
}));
vi.mock('./git-info.js', () => ({
  getGitInfo: vi.fn(() => ({ gitBranch: 'main', gitCommit: '1234567' }))
}));
vi.mock('./security.js', () => ({
  isRestrictedFile: vi.fn(),
  scanContentForSecrets: vi.fn()
}));

import { isRestrictedFile, scanContentForSecrets } from './security.js';

describe('run-context', () => {
  const cwd = process.cwd();
  const mockFile = 'test.txt';
  const absMockFile = path.resolve(cwd, mockFile);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default happy path mocks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('dummy content');
    vi.mocked(isRestrictedFile).mockReturnValue(false);
    vi.mocked(scanContentForSecrets).mockReturnValue({ found: false });
  });

  it('should initialize successfully with valid file', () => {
    const ctx = setupRunContext({
      commandName: 'ask',
      file: mockFile,
      prompt: 'hello'
    });

    expect(ctx.provider.name).toBe('mock');
    expect(ctx.contextContent).toBe('dummy content');
    expect(ctx.fileName).toBe(mockFile);
  });

  it('should throw Error if file is too large', () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 2000000 } as fs.Stats); // > 1MB

    expect(() => {
      setupRunContext({
        commandName: 'ask',
        file: mockFile,
        prompt: 'hello'
      });
    }).toThrow(/too large/);
  });

  it('should throw Error if file is restricted', () => {
    vi.mocked(isRestrictedFile).mockReturnValue(true);

    expect(() => {
      setupRunContext({
        commandName: 'ask',
        file: '.env',
        prompt: 'hello'
      });
    }).toThrow(/restricted file/);
  });

  it('should save blocked log and throw SecurityBlockError if secrets found', () => {
    vi.mocked(scanContentForSecrets).mockReturnValue({ found: true, type: 'AWS Key' });
    
    let error: any;
    try {
      setupRunContext({
        commandName: 'ask',
        file: mockFile,
        prompt: 'hello'
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(SecurityBlockError);
    expect(error.message).toContain('AWS Key');

    // Verify fs.writeFileSync was called with blocked payload
    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const payload = JSON.parse(writeCall[1] as string);
    expect(payload.status).toBe('blocked');
    expect(payload.detectedSecretType).toBe('AWS Key');
  });

  it('saveResult should overwrite basePayload fields properly', () => {
    const ctx = setupRunContext({
      commandName: 'ask',
      file: mockFile,
      prompt: 'hello'
    });

    // Call saveResult with a specific status
    const finalPayload = ctx.saveResult({
      status: 'success',
      diffPath: '/some/path'
    }) as any;

    expect(finalPayload.status).toBe('success');
    expect(finalPayload.diffPath).toBe('/some/path');
    expect(finalPayload.prompt).toBe('hello'); // From base payload
    expect(finalPayload.gitBranch).toBe('main'); // From base payload

    // Verify it was written
    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(JSON.parse(writeCall[1] as string)).toEqual(finalPayload);
  });
});
