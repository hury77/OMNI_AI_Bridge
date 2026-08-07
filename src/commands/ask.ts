import { Command } from 'commander';
import chalk from 'chalk';
import { setupRunContext, SecurityBlockError } from '../core/run-context.js';

export const askCommand = new Command('ask')
  .description('Ask a question about a specific context')
  .argument('<question>', 'The question to ask about the context')
  .option('-f, --file <path>', 'A single file to use as context')
  .option('--files <paths>', 'Comma-separated list of files to use as context')
  .option('--dir <path>', 'A directory to use as context (recursive)')
  .option('-p, --provider <name>', 'Override AI provider')
  .option('-m, --model <name>', 'Override AI model')
  .option('--dry-run', 'Prepare the request but do not send it to the AI provider')
  .action(async (question: string, options: { provider?: string, model?: string, file?: string, files?: string, dir?: string, dryRun?: boolean }) => {
    
    const specifiedFlags = [options.file, options.files, options.dir].filter(Boolean);
    if (specifiedFlags.length === 0) {
      console.error(chalk.red(`ERROR: You must specify exactly one of --file, --files, or --dir`));
      process.exit(1);
    }
    if (specifiedFlags.length > 1) {
      console.error(chalk.red(`ERROR: --file, --files, and --dir are mutually exclusive.`));
      process.exit(1);
    }

    let ctx;
    
    try {
      ctx = setupRunContext({
        commandName: 'ask',
        file: options.file,
        files: options.files ? options.files.split(',').map(f => f.trim()) : undefined,
        dir: options.dir,
        providerOverride: options.provider,
        modelOverride: options.model,
        prompt: question
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
    
    const fullPrompt = `Context:\n${ctx.contextString}\n\nQuestion: ${question}`;
    
    if (options.dryRun) {
      console.log(chalk.blue(`\n[DRY RUN] Prompt prepared:`));
      console.log(fullPrompt);
      
      ctx.saveResult({
        status: "dry-run",
        response: null
      });
      
      console.log(chalk.dim(`\n[Saved dry-run event to .omniqa/runs/${ctx.timestamp}_ask/result.json]`));
      return;
    }

    try {
      const response = await ctx.provider.send({ prompt: fullPrompt, context: undefined });
      
      ctx.saveResult({
        status: "success",
        response: response
      });

      console.log(chalk.green(`\nAI Response:`));
      console.log(response.text);
      console.log(chalk.dim(`\n[Saved run log to .omniqa/runs/${ctx.timestamp}_ask/result.json]`));
      
    } catch (error) {
      console.error(chalk.red(`\nError communicating with provider: ${(error as Error).message}`));
      
      ctx.saveResult({
        status: "error",
        error: (error as Error).message
      });

      console.log(chalk.dim(`\n[Saved error log to .omniqa/runs/${ctx.timestamp}_ask/result.json]`));
      process.exit(1);
    }
  });
