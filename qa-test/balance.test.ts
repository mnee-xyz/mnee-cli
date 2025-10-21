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
const CLI_COMMAND = 'mnee balance';

async function executeCLI(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
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


test('🔧 Balance Command - Prerequisites', async (t) => {
  console.log(chalk.cyan('\n=== Checking CLI prerequisites ==='));

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


test('🔧 Balance Command - CLI Execution', async (t) => {
  console.log(chalk.cyan('\n=== Running balance CLI command ==='));

  let activeWallet: any;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found.');
  });

  await t.test('Run CLI and capture output', async () => {
    const result = await executeCLI(CLI_COMMAND);
    const output = result.stdout || result.stderr;

    console.log(chalk.yellow('\n📊 CLI Output:\n'));
    console.log(output);
    console.log(chalk.gray(`\nExit Code: ${result.exitCode}`));

    assert.ok(output.length > 0, 'CLI should produce some output');
  });

  await t.test('Wallet name appears', async () => {
    const { stdout, stderr } = await executeCLI(CLI_COMMAND);
    const output = stdout || stderr;
    assert.ok(
      output.includes(activeWallet.name),
      `Output should contain wallet name: ${activeWallet.name}`
    );
    console.log(chalk.green('✅ Wallet name verified in output'));
  });

  await t.test('Wallet address appears', async () => {
    const { stdout, stderr } = await executeCLI(CLI_COMMAND);
    const output = stdout || stderr;
    assert.ok(
      output.includes(activeWallet.address.slice(0, 6)) ||
      output.includes(activeWallet.address),
      'Output should contain wallet address'
    );
    console.log(chalk.green('✅ Wallet address verified in output'));
  });

  await t.test('Balance amount shown', async () => {
    const { stdout, stderr } = await executeCLI(CLI_COMMAND);
    const output = stdout || stderr;
    assert.ok(/\d+(\.\d+)?/.test(output), 'Output should display balance amount');
    console.log(chalk.green('✅ Balance amount detected in CLI output'));
  });
});


test('🧾 Test Summary', async () => {
  console.log(chalk.cyan('\n=== ✅ All balance command tests completed! ==='));
  console.log(chalk.green('\n📝 Summary:'));
  console.log(chalk.white('   ✓ Uses real keytar wallets'));
  console.log(chalk.white('   ✓ Verifies CLI balance command'));
});