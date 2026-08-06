import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { setupRunContext, SecurityBlockError } from '../core/run-context.js';
import { sanitizeAIOutput, generateUnifiedDiff } from '../core/diff-generator.js';

export const devCommand = new Command('dev')
  .description('Ask AI to modify a file and generate a patch')
  .argument('<task>', 'Description of what needs to be changed')
  .requiredOption('-f, --file <path>', 'The file to modify (required)')
  .option('-p, --provider <name>', 'Override AI provider')
  .option('-m, --model <name>', 'Override AI model')
  .action(async (task: string, options: { provider?: string, model?: string, file: string }) => {
    let ctx;
    
    try {
      ctx = setupRunContext({
        commandName: 'dev',
        file: options.file,
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
    const systemInstruction = `[SYSTEM]: You are an automated code editor. You must return ONLY the complete, fully updated content of the file. Do not include any explanations, greetings, or markdown code blocks (like \`\`\`). Preserve the original code style, indentation, and formatting except where the requested change requires otherwise. Provide the raw text exactly as it should be saved.`;
    const fullPrompt = `${systemInstruction}\n\nTask:\n${task}\n\nFile Content to modify:\n${ctx.contextContent}`;

    try {
      const response = await ctx.provider.send({ prompt: fullPrompt, context: undefined });
      
      const newContent = sanitizeAIOutput(response.text);

      if (newContent.trim() === ctx.contextContent.trim()) {
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
        const patch = generateUnifiedDiff(ctx.contextContent, newContent, ctx.fileName);
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
