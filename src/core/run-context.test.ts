import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupRunContext, SecurityBlockError } from './run-context.js';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('fs');
vi.mock('./config.js', () => ({
  loadConfig: vi.fn(() => null)
}));
vi.mock('./git-info.js', () => ({
  getGitInfo: vi.fn(() => ({ gitBranch: 'main', gitCommit: '1234567' }))
}));
vi.mock('./context-builder.js', () => {
  return {
    buildContext: vi.fn(),
    SecurityBlockError: class SecurityBlockError extends Error {
      public type: string;
      constructor(message: string, type: string = 'security_blocked') {
        super(message);
        this.name = 'SecurityBlockError';
        this.type = type;
      }
    }
  };
});

import { buildContext, SecurityBlockError as MockSecurityBlockError } from './context-builder.js';

describe('run-context', () => {
  const cwd = process.cwd();
  const mockFile = 'test.txt';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default happy path mocks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);
    
    vi.mocked(buildContext).mockReturnValue({
      targetContent: 'dummy content',
      targetFile: mockFile,
      contextString: 'File: test.txt\n---\ndummy content\n---',
      contextFilesMeta: [
        { path: mockFile, included: true, size: 100 }
      ]
    });
  });

  it('should initialize successfully with valid file', () => {
    const ctx = setupRunContext({
      commandName: 'ask',
      file: mockFile,
      prompt: 'hello'
    });

    expect(ctx.provider.name).toBe('mock');
    expect(ctx.targetContent).toBe('dummy content');
    expect(ctx.targetFile).toBe(mockFile);
  });

  it('should throw SecurityBlockError if context builder throws it', () => {
    vi.mocked(buildContext).mockImplementation(() => {
      throw new MockSecurityBlockError('Security violation', 'AWS Key');
    });
    
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

    expect(error).toBeInstanceOf(MockSecurityBlockError);
    expect(error.message).toContain('Security violation');

    // Verify fs.writeFileSync was called with blocked payload
    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const payload = JSON.parse(writeCall[1] as string);
    expect(payload.status).toBe('blocked');
    expect(payload.detectedSecretType).toBe('AWS Key');
  });

  it('should throw generic error if context builder throws error', () => {
    vi.mocked(buildContext).mockImplementation(() => {
      throw new Error('File is too large');
    });

    expect(() => {
      setupRunContext({
        commandName: 'ask',
        file: mockFile,
        prompt: 'hello'
      });
    }).toThrow(/too large/);
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
    expect(finalPayload.targetFile).toBe(mockFile); // Added from context build

    // Verify it was written
    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(JSON.parse(writeCall[1] as string)).toEqual(finalPayload);
  });
});
