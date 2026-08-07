import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { setupRunContext, SecurityBlockError } from '../core/run-context.js';
import { sanitizeAIOutput, generateUnifiedDiff } from '../core/diff-generator.js';

export const devCommand = new Command('dev')
  .description('Ask AI to modify a file and generate a patch')
  .argument('<task>', 'Description of what needs to be changed')
  .requiredOption('-f, --file <path>', 'The target file to modify (required)')
  .option('--context-files <paths>', 'Comma-separated list of additional files for read-only context')
  .option('--context-dir <path>', 'A directory of additional files for read-only context (recursive)')
  .option('-p, --provider <name>', 'Override AI provider')
  .option('-m, --model <name>', 'Override AI model')
  .action(async (task: string, options: { provider?: string, model?: string, file: string, contextFiles?: string, contextDir?: string }) => {
    let ctx;
    
    try {
      ctx = setupRunContext({
        commandName: 'dev',
        file: options.file,
        files: options.contextFiles ? options.contextFiles.split(',').map(f => f.trim()) : undefined,
        dir: options.contextDir,
        providerOverride: options.provider,
        modelOverride: options.model,
        prompt: task
      });
    } catch (error) {
      if (error instanceof SecurityBlockError) {
        console.error(chalk.red(`ERROR: ${(error as Error).message}`));
        console.log(chalk.dim(`\n[Saved blocked event to .omniqa/runs/...]`));
      } else {
        console.error(chalk.red(`ERROR: ${(error as Error).message}`));
      }
      process.exit(1);
    }

    console.log(chalk.yellow(`Attached target file: ${options.file}`));
    console.log(chalk.dim(`Task: ${task}`));

    // Build Prompt with System Instruction
    const systemInstruction = `[SYSTEM]: You are an automated code editor. You must return ONLY the complete, fully updated content of the target file. Do not include any explanations, greetings, or markdown code blocks (like \`\`\`). Preserve the original code style, indentation, and formatting except where the requested change requires otherwise. Provide the raw text exactly as it should be saved.`;
    const backgroundContext = ctx.contextString ? `Background Context:\n${ctx.contextString}\n\n` : '';
    const fullPrompt = `${systemInstruction}\n\n${backgroundContext}Task:\n${task}\n\nFile Content to modify:\n${ctx.targetContent}`;

    try {
      const response = await ctx.provider.send({ prompt: fullPrompt, context: undefined });
      
      const newContent = sanitizeAIOutput(response.text);

      if (newContent.trim() === ctx.targetContent!.trim()) {
        // No changes
        ctx.saveResult({
          status: "no-changes",
          response: { summary: "AI returned identical content. No diff generated." }
        });
        
        console.log(chalk.cyan(`\nStatus: No changes detected.`));
        console.log(chalk.dim(`[Saved run log to .omniqa/runs/${ctx.timestamp}_dev/result.json]`));
      } else {
        // Generate Diff
        const diffPath = path.join(ctx.runsDir, 'proposed.diff');
        // ctx.targetFile from result is a relative path which generateUnifiedDiff uses as well.
        // Wait, previously it was ctx.relativePath which was `path.relative(cwd, filePath)`.
        // ctx.targetFile is precisely that.
        const patch = generateUnifiedDiff(ctx.targetContent!, newContent, ctx.targetFile!);
        fs.writeFileSync(diffPath, patch, 'utf8');

        ctx.saveResult({
          status: "success",
          diffPath: diffPath,
          response: { summary: "Diff generated successfully." }
        });

        console.log(chalk.green(`\nPatch generated successfully!`));
        console.log(chalk.yellow(`Review the diff in .omniqa/runs/${ctx.timestamp}_dev/proposed.diff and apply manually — 'omniqa apply' is not yet implemented.`));
        console.log(chalk.dim(`\n[Saved run log to .omniqa/runs/${ctx.timestamp}_dev/result.json]`));
      }

    } catch (error) {
      console.error(chalk.red(`\nError communicating with provider: ${(error as Error).message}`));
      
      ctx.saveResult({
        status: "error",
        error: (error as Error).message
      });

      console.log(chalk.dim(`\n[Saved error log to .omniqa/runs/${ctx.timestamp}_dev/result.json]`));
      
      process.exit(1);
    }
  });
