import { Command } from 'commander';
import chalk from 'chalk';
import { setupRunContext, SecurityBlockError } from '../core/run-context.js';

export const askCommand = new Command('ask')
  .description('Ask a question about a specific file context')
  .argument('<question>', 'The question to ask about the file')
  .requiredOption('-f, --file <path>', 'The file to use as context')
  .option('-p, --provider <name>', 'Override AI provider')
  .option('-m, --model <name>', 'Override AI model')
  .option('--dry-run', 'Prepare the request but do not send it to the AI provider')
  .action(async (question: string, options: { provider?: string, model?: string, file: string, dryRun?: boolean }) => {
    let ctx;
    
    try {
      ctx = setupRunContext({
        commandName: 'ask',
        file: options.file,
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

    console.log(chalk.yellow(`Attached context file: ${options.file}`));
    
    const fullPrompt = `Context:\n${ctx.contextContent}\n\nQuestion: ${question}`;
    
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
