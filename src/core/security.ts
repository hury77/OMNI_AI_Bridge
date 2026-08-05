export interface SecretScanResult {
  found: boolean;
  type?: string;
}

export function isRestrictedFile(fileName: string): boolean {
  // Critical files
  if (
    fileName === '.env' ||
    fileName.endsWith('.pem') ||
    fileName.endsWith('.key') ||
    fileName.startsWith('credentials')
  ) {
    return true;
  }
  
  // Lockfiles
  if (
    fileName === 'pnpm-lock.yaml' ||
    fileName === 'package-lock.json' ||
    fileName === 'yarn.lock'
  ) {
    return true;
  }
  
  return false;
}

export function scanContentForSecrets(content: string): SecretScanResult {
  const secretPatterns = [
    { type: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
    { type: 'OpenAI-style key', regex: /sk-[a-zA-Z0-9]{20,}/ },
    { type: 'Private key header', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
    // A simple heuristic for passwords or tokens in a generic line assignment, requiring quotes to avoid false positives
    { type: 'Generic secret/token', regex: /(?:password|secret|token)\s*=\s*['"][^'"]{5,}['"]/i }
  ];

  for (const pattern of secretPatterns) {
    if (pattern.regex.test(content)) {
      return { found: true, type: pattern.type };
    }
  }

  return { found: false };
}
