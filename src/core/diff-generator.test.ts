import { describe, it, expect } from 'vitest';
import { sanitizeAIOutput, generateUnifiedDiff } from './diff-generator.js';

describe('diff-generator', () => {
  describe('sanitizeAIOutput', () => {
    it('should return the raw output if no code block wraps it', () => {
      const raw = 'const x = 1;\nconsole.log(x);';
      expect(sanitizeAIOutput(raw)).toBe(raw);
    });

    it('should remove markdown fences if they perfectly wrap the code', () => {
      const raw = '```typescript\nconst x = 1;\nconsole.log(x);\n```';
      expect(sanitizeAIOutput(raw)).toBe('const x = 1;\nconsole.log(x);');
    });

    it('should handle messy backticks at start and end', () => {
      const raw = '```\nconst x = 1;\n```';
      expect(sanitizeAIOutput(raw)).toBe('const x = 1;');
    });

    it('should preserve text if there are backticks inside but not fully wrapping', () => {
      const raw = 'Here is the code:\n```\nconst x = 1;\n```\nHope it helps!';
      // It won't strip because it's not a single fence wrapping everything perfectly
      expect(sanitizeAIOutput(raw)).toBe(raw);
    });
  });

  describe('generateUnifiedDiff', () => {
    it('should generate a valid unified diff for changes', () => {
      const oldCode = 'const a = 1;\nconst b = 2;\n';
      const newCode = 'const a = 1;\nconst b = 3;\n';
      const diff = generateUnifiedDiff(oldCode, newCode, 'test.ts');
      
      expect(diff).toContain('--- test.ts\tOriginal');
      expect(diff).toContain('+++ test.ts\tModified');
      expect(diff).toContain('-const b = 2;');
      expect(diff).toContain('+const b = 3;');
    });

    it('should not contain +/- lines if identical', () => {
      const code = 'const a = 1;\n';
      const diff = generateUnifiedDiff(code, code, 'test.ts');
      expect(diff).not.toContain('-const a = 1;');
      expect(diff).not.toContain('+const a = 1;');
    });
  });
});
