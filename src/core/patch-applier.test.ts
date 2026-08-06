import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateRunForApply,
  parseDiffStats,
  checkPatchApplicability,
  applyPatch,
  markRunAsApplied,
  PatchValidationError,
  PatchGitError
} from './patch-applier.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

vi.mock('fs');
vi.mock('child_process');

describe('patch-applier', () => {
  const cwd = process.cwd();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateRunForApply', () => {
    it('should throw if runId contains path separators', () => {
      expect(() => validateRunForApply('some/path', cwd)).toThrow(PatchValidationError);
      expect(() => validateRunForApply('some\\path', cwd)).toThrow(PatchValidationError);
    });

    it('should throw if run directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => validateRunForApply('123_dev', cwd)).toThrow(/Run directory not found/);
    });

    it('should throw if result.json status is not success', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath.toString().endsWith('result.json')) {
          return JSON.stringify({ status: 'blocked' });
        }
        return '';
      });
      
      expect(() => validateRunForApply('123_dev', cwd)).toThrow(/Run status is 'blocked'/);
    });

    it('should throw if already applied', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath.toString().endsWith('result.json')) {
          return JSON.stringify({ status: 'success', appliedAt: '2026-08-05T00:00:00Z' });
        }
        return '';
      });
      
      expect(() => validateRunForApply('123_dev', cwd)).toThrow(/already applied/);
    });

    it('should validate and return paths if valid', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath.toString().endsWith('result.json')) {
          return JSON.stringify({ status: 'success', diffPath: '.omniqa/runs/123_dev/p.diff' });
        }
        return 'dummy diff content';
      });

      const res = validateRunForApply('123_dev', cwd);
      expect(res.diffContent).toBe('dummy diff content');
      expect(res.diffPath.endsWith('p.diff')).toBe(true);
    });
  });

  describe('parseDiffStats', () => {
    it('should parse added/removed lines and filename correctly', () => {
      const diff = `Index: src/main.ts
===================================================================
--- src/main.ts	Original
+++ src/main.ts	Modified
@@ -1,5 +1,5 @@
 function hello() {
-  console.log("old");
+  console.log("new1");
+  console.log("new2");
 }
`;
      const stats = parseDiffStats(diff);
      expect(stats.targetFile).toBe('src/main.ts');
      expect(stats.removed).toBe(1);
      expect(stats.added).toBe(2);
    });
  });

  describe('checkPatchApplicability & applyPatch', () => {
    it('should not throw if execSync succeeds', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      expect(() => checkPatchApplicability('diff.patch', cwd)).not.toThrow();
      expect(() => applyPatch('diff.patch', cwd)).not.toThrow();
    });

    it('should throw PatchGitError if execSync fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        const err: any = new Error('Command failed');
        err.stderr = Buffer.from('patch does not apply');
        throw err;
      });

      expect(() => checkPatchApplicability('diff.patch', cwd)).toThrow(PatchGitError);
      expect(() => checkPatchApplicability('diff.patch', cwd)).toThrow(/patch does not apply/);
    });
  });

  describe('markRunAsApplied', () => {
    it('should update result.json with appliedAt', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ status: 'success' }));
      
      markRunAsApplied('dummy.json');
      
      expect(fs.writeFileSync).toHaveBeenCalled();
      const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
      const written = JSON.parse(callArgs[1] as string);
      expect(written.appliedAt).toBeDefined();
    });
  });
});
