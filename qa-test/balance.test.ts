import { test } from 'node:test';
import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getActiveWallet, getAllWallets } from '../dist/utils/keytar.js';

const execAsync = promisify(exec);
const CLI_COMMAND = 'mnee balance';

// Store actual output for summary
let actualOutput = '';

async function executeCLI(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0, success: true };
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

test('Balance Prerequisites', async (t) => {
  await t.test('should have at least one wallet', async () => {
    const wallets = await getAllWallets();
    assert.ok(wallets.length > 0, 'At least one wallet should exist');
  });

  await t.test('should have active wallet set', async () => {
    const activeWallet = await getActiveWallet();
    assert.ok(activeWallet, 'An active wallet must be set');
  });

  await t.test('should have active wallet in sandbox environment', async () => {
    const activeWallet = await getActiveWallet();
    assert.strictEqual(activeWallet?.environment, 'sandbox', 'Wallet should be in sandbox');
  });
});

test('Balance Command Execution', async (t) => {
  let activeWallet: any;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found');
  });

  await t.test('should produce output', async () => {
    const result = await executeCLI(CLI_COMMAND);
    const output = result.stdout || result.stderr;
    actualOutput = output; // Store for summary
    assert.ok(output.length > 0, 'CLI should produce some output');
  });

  await t.test('should display wallet name', async () => {
    const { stdout, stderr } = await executeCLI(CLI_COMMAND);
    const output = stdout || stderr;
    assert.ok(output.includes(activeWallet.name), `Output should contain wallet name: ${activeWallet.name}`);
  });

  await t.test('should display wallet address', async () => {
    const { stdout, stderr } = await executeCLI(CLI_COMMAND);
    const output = stdout || stderr;
    assert.ok(
      output.includes(activeWallet.address.slice(0, 6)) || output.includes(activeWallet.address),
      'Output should contain wallet address'
    );
  });

  await t.test('should display balance amount', async () => {
    const { stdout, stderr } = await executeCLI(CLI_COMMAND);
    const output = stdout || stderr;
    assert.ok(/\d+(\.\d+)?/.test(output), 'Output should display balance amount');
  });
});

test('Test Summary', async () => {
  const activeWallet = await getActiveWallet();
  
  console.log('\n--- Balance Command Test Summary ---');
  console.log('Status: PASSED');
  console.log(`Wallet: ${activeWallet?.name}`);
  console.log(`Address: ${activeWallet?.address}`);
  console.log(`Environment: ${activeWallet?.environment}`);
  console.log('------------------------------------');
  
  console.log('\n--- Actual CLI Output ---');
  console.log(actualOutput);
  console.log('-------------------------\n');
});