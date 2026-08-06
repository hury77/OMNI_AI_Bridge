import { Command } from 'commander';
import chalk from 'chalk';
import {
  validateRunForApply,
  parseDiffStats,
  checkPatchApplicability,
  applyPatch,
  markRunAsApplied,
  PatchValidationError,
  PatchGitError
} from '../core/patch-applier.js';
import { confirm } from '@inquirer/prompts';

export const applyCommand = new Command('apply')
  .description('Apply a previously generated patch from a run directory')
  .argument('<run-id>', 'The ID of the run (folder name, e.g. 20260805_222043Z_dev)')
  .action(async (runId: string) => {
    const cwd = process.cwd();

    let validationResult;
    try {
      validationResult = validateRunForApply(runId, cwd);
    } catch (error) {
      if (error instanceof PatchValidationError) {
        console.error(chalk.red(`ERROR: ${(error as Error).message}`));
        process.exit(1);
      }
      throw error;
    }

    const { diffPath, resultJsonPath, diffContent } = validationResult;
    const stats = parseDiffStats(diffContent);

    // Pre-flight check
    try {
      checkPatchApplicability(diffPath, cwd);
    } catch (error) {
      if (error instanceof PatchGitError) {
        console.error(chalk.red(`ERROR: ${(error as Error).message}`));
        console.error(chalk.yellow(`\nThe patch cannot be applied cleanly. This usually means the target file has changed since the patch was generated, or you have uncommitted changes.`));
        process.exit(1);
      }
      throw error;
    }

    // Display the patch with colors
    console.log(chalk.cyan(`\n=== Patch Preview ===\n`));
    const lines = diffContent.split('\n');
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log(chalk.green(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log(chalk.red(line));
      } else if (line.startsWith('@@')) {
        console.log(chalk.magenta(line));
      } else {
        console.log(chalk.gray(line));
      }
    }
    console.log(chalk.cyan(`=====================\n`));

    // Confirm with user
    const targetFile = stats.targetFile || 'unknown file';
    const answer = await confirm({
      message: `Apply this patch to ${targetFile}? This will modify files on disk.`,
      default: false
    });

    if (!answer) {
      console.log(chalk.yellow(`\nAction cancelled. No files were modified.`));
      process.exit(0);
    }

    // Apply the patch
    try {
      applyPatch(diffPath, cwd);
    } catch (error) {
      if (error instanceof PatchGitError) {
        console.error(chalk.red(`ERROR: ${(error as Error).message}`));
        process.exit(1);
      }
      throw error;
    }

    // Mark as applied
    markRunAsApplied(resultJsonPath);

    // Summary
    console.log(chalk.green(`\nPatch applied successfully!`));
    console.log(chalk.dim(`Modified: ${targetFile}`));
    console.log(chalk.green(`+ ${stats.added} additions`));
    console.log(chalk.red(`- ${stats.removed} deletions`));
    
    console.log(chalk.blue(`\n💡 To revert this change, run: git apply -R "${diffPath}"`));
  });
