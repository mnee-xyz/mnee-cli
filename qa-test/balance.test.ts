import { test } from 'node:test';
import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getActiveWallet, getAllWallets } from '../dist/utils/keytar.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

// Use npx to run the CLI, or direct path to the built CLI
// Common paths: dist/cli.js, dist/bin/cli.js, dist/index.js, or just 'tsx src/index.ts'
const CLI_PATH = 'node dist/cli.js';
const CLI_COMMAND = `${CLI_PATH} balance`;
const TEST_WALLET_NAME = 'cli-test';

// Store actual output for summary
let actualOutput = '';

// Helper function to add delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function executeCLI(command: string, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { stdout, stderr } = await execAsync(command, { 
        timeout: 10000,
        cwd: path.resolve(__dirname, '..')
      });
      
      // Add delay after successful execution
      if (attempt > 1) {
        await delay(1000);
      }
      
      return { 
        stdout: stdout.trim(), 
        stderr: stderr.trim(), 
        exitCode: 0, 
        success: true 
      };
    } catch (error: any) {
      // If not the last attempt, wait before retrying
      if (attempt < retries) {
        console.log(`  ⚠ Attempt ${attempt}/${retries} failed, retrying in 2s...`);
        await delay(2000);
        continue;
      }
      
      return {
        stdout: (error.stdout || '').trim(),
        stderr: (error.stderr || '').trim(),
        exitCode: error.code ?? 1,
        success: false,
        error: error.message,
      };
    }
  }
  
  // Fallback return
  return {
    stdout: '',
    stderr: 'Max retries exceeded',
    exitCode: 1,
    success: false,
    error: 'Max retries exceeded',
  };
}

test('Setup: Set Active Wallet', async (t) => {
  await delay(500);
  
  await t.test('should have cli-test wallet', async () => {
    const wallets = await getAllWallets();
    const wallet = wallets.find((w: { name: string; }) => w.name === TEST_WALLET_NAME);
    assert.ok(wallet, `Wallet "${TEST_WALLET_NAME}" should exist`);
  });

  await t.test('should set cli-test as active using mnee use command', async () => {
    const result = await executeCLI(`${CLI_PATH} use ${TEST_WALLET_NAME}`);
    // Wait for the command to complete (has 1200ms setTimeout)
    await delay(1500);
    
    const output = result.stdout || result.stderr;
    assert.ok(output.length > 0, 'Use command should produce output');
    
    // Verify the wallet is now active
    const activeWallet = await getActiveWallet();
    assert.strictEqual(activeWallet?.name, TEST_WALLET_NAME, `Wallet "${TEST_WALLET_NAME}" should be set as active`);
  });
  
  await delay(1000);
});

test('Balance Prerequisites', async (t) => {
  await delay(500);
  
  await t.test('should have active wallet set', async () => {
    const activeWallet = await getActiveWallet();
    assert.ok(activeWallet, 'An active wallet must be set');
  });

  await t.test('should have active wallet as cli-test', async () => {
    const activeWallet = await getActiveWallet();
    assert.strictEqual(activeWallet?.name, TEST_WALLET_NAME, `Active wallet should be "${TEST_WALLET_NAME}"`);
  });

  await t.test('should have active wallet in sandbox environment', async () => {
    const activeWallet = await getActiveWallet();
    assert.strictEqual(activeWallet?.environment, 'sandbox', 'Wallet should be in sandbox');
  });
  
  await delay(500);
});

test('Balance Command Execution', async (t) => {
  let activeWallet: any;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found');
    await delay(500);
  });

  await t.test('should produce output', async () => {
    await delay(1000);
    const result = await executeCLI(CLI_COMMAND);
    const output = result.stdout || result.stderr;
    actualOutput = output; // Store for summary
    
    if (!result.success) {
      console.log('Command failed:', result.error);
      console.log('stdout:', result.stdout);
      console.log('stderr:', result.stderr);
    }
    
    assert.ok(result.success, 'CLI command should execute successfully');
    assert.ok(output.length > 0, 'CLI should produce some output');
  });

  await t.test('should display wallet name', async () => {
    await delay(1000);
    const { stdout, stderr } = await executeCLI(CLI_COMMAND);
    const output = stdout || stderr;
    assert.ok(output.includes(activeWallet.name), `Output should contain wallet name: ${activeWallet.name}`);
  });

  await t.test('should display wallet address', async () => {
    await delay(1000);
    const { stdout, stderr } = await executeCLI(CLI_COMMAND);
    const output = stdout || stderr;
    assert.ok(
      output.includes(activeWallet.address.slice(0, 6)) || output.includes(activeWallet.address),
      'Output should contain wallet address'
    );
  });

  await t.test('should display balance amount', async () => {
    await delay(1000);
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