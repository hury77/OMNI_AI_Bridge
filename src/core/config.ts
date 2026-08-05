import path from 'path';
import fs from 'fs';
import yaml from 'yaml';

export function loadConfig(cwd: string): any {
  const configPath = path.join(cwd, 'omniqa.yaml');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  const content = fs.readFileSync(configPath, 'utf8');
  try {
    return yaml.parse(content);
  } catch (err) {
    console.error(`Failed to parse omniqa.yaml: ${(err as Error).message}`);
    return null;
  }
}
