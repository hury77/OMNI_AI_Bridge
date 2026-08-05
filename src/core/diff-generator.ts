import * as diff from 'diff';

/**
 * Removes markdown code fences from the AI output if the AI wrapped the entire response in them.
 */
export function sanitizeAIOutput(rawOutput: string): string {
  let sanitized = rawOutput.trim();
  
  // If the output is entirely wrapped in a markdown code block, extract the content
  const codeBlockRegex = /^```[a-zA-Z]*\n([\s\S]*?)```$/;
  const match = sanitized.match(codeBlockRegex);
  
  if (match && match[1]) {
    // If it perfectly matched a single code block wrapping the entire output
    return match[1].trimEnd();
  }

  // Fallback: sometimes the AI might forget the newlines or use ``` at the start and end but with other stuff
  if (sanitized.startsWith('```') && sanitized.endsWith('```')) {
    const lines = sanitized.split('\n');
    if (lines.length >= 2) {
      // Remove first line if it starts with ```
      if (lines[0].startsWith('```')) {
        lines.shift();
      }
      // Remove last line if it starts with ```
      if (lines.length > 0 && lines[lines.length - 1].startsWith('```')) {
        lines.pop();
      }
      return lines.join('\n').trimEnd();
    }
  }

  return rawOutput;
}

/**
 * Generates a unified diff using the 'diff' library.
 */
export function generateUnifiedDiff(originalContent: string, newContent: string, filename: string): string {
  // Ensure both end with a newline for standard diff behavior
  const ensureNewline = (str: string) => str.endsWith('\n') ? str : str + '\n';
  
  const patch = diff.createTwoFilesPatch(
    filename, // oldFileName
    filename, // newFileName
    ensureNewline(originalContent),
    ensureNewline(newContent),
    'Original', // oldHeader
    'Modified', // newHeader
    { context: 3 }
  );

  return patch;
}
