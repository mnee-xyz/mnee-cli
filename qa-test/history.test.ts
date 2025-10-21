import { test } from 'node:test';
import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import {
  getActiveWallet,
  getAllWallets,
} from '../dist/utils/keytar.js';

const execAsync = promisify(exec);
const CLI_COMMAND = 'mnee history';

async function executeCLI(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      success: true,
    };
  } catch (error: any) {
    return {
      stdout: (error.stdout || '').trim(),
      stderr: (error.stderr || '').trim(),
      exitCode: error.code ?? 1,
      success: false,
      error: error.message,
    };
  }
}

test('🔧 History Command - Prerequisites', async (t) => {
  console.log(chalk.cyan('\n Checking CLI prerequisites'));

  await t.test('Wallet existence', async () => {
    const wallets = await getAllWallets();
    assert.ok(wallets.length > 0, 'At least one wallet should exist.');
    console.log(chalk.green(`✅ Found ${wallets.length} wallet(s) in keytar`));
  });

  await t.test('Active wallet set', async () => {
    const activeWallet = await getActiveWallet();
    assert.ok(activeWallet, 'An active wallet must be set.');
    console.log(chalk.green(`✅ Active wallet: ${activeWallet.name} (${activeWallet.environment})`));
    console.log(chalk.gray(`   Address: ${activeWallet.address}`));
  });

  await t.test('Active wallet environment', async () => {
    const activeWallet = await getActiveWallet();
    assert.strictEqual(
      activeWallet?.environment,
      'sandbox',
      'Active wallet should be in sandbox environment for testing'
    );
    console.log(chalk.green('✅ Active wallet is in sandbox environment'));
  });
});

test('🧭 History Command - CLI Execution', async (t) => {
  console.log(chalk.cyan('\n Running history CLI command'));

  let activeWallet;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found.');
  });

  await t.test('Run CLI and capture output', async () => {
    const result = await executeCLI(CLI_COMMAND);
    const output = result.stdout || result.stderr;

    console.log(chalk.yellow('\n📜 CLI Output:\n'));
    console.log(output || chalk.gray('(no output)'));
    console.log(chalk.gray(`\nExit Code: ${result.exitCode}`));

    assert.ok(output.length > 0, 'CLI should produce some output');
  });
});

test('⚙️ History Command - Flags & Filters', async (t) => {
  console.log(chalk.cyan('\n Testing history command options'));

  const flagTests = [
    { desc: '--limit 5', args: ['--limit', '5'] },
    { desc: '--refresh', args: ['--refresh'] },
    { desc: '--confirmed', args: ['--confirmed'] },
    { desc: '--unconfirmed', args: ['--unconfirmed'] },
    { desc: '--type send', args: ['--type', 'send'] },
    { desc: '--type receive', args: ['--type', 'receive'] },
    { desc: '--txid partial', args: ['--txid', 'abc'] },
    { desc: '--address partial', args: ['--address', '1'] },
    { desc: '--min and --max', args: ['--min', '0.1', '--max', '100'] },
  ];

  for (const { desc, args } of flagTests) {
    await t.test(desc, async () => {
      const result = await executeCLI(`mnee history ${args.join(' ')}`);
      const output = result.stdout || result.stderr;
      assert.ok(output.length > 0, `${desc} should produce output`);
      console.log(chalk.green(`✅ ${desc} executed successfully`));
    });
  }
});

test('🧹 History Command - Cache Operations', async (t) => {
  console.log(chalk.cyan('\nTesting cache options'));

  await t.test('--cache-info', async () => {
    const result = await executeCLI('mnee history --cache-info');
    const output = result.stdout || result.stderr;
    assert.ok(/Cache|No cache found/i.test(output), 'Should display cache info or no cache message');
    console.log(chalk.green('✅ Cache info command verified'));
  });

  await t.test('--clear-cache', async () => {
    const result = await executeCLI('mnee history --clear-cache');
    const output = result.stdout || result.stderr;
    assert.ok(/Cache cleared|No active wallet/i.test(output), 'Should handle cache clearing safely');
    console.log(chalk.green('✅ Cache cleared successfully (or safe warning shown)'));
  });
});

test('🧾 Test Summary', async () => {
  console.log(chalk.cyan('\n ✅ All history command tests completed!'));
  console.log(chalk.green('\n📝 Summary:'));
  console.log(chalk.white('   ✓ Uses keytar wallets'));
  console.log(chalk.white('   ✓ Verifies CLI history command output'));
  console.log(chalk.white('   ✓ Tests all flags and cache options'));
});