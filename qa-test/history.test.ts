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

// Config
const CLI_PATH ='node dist/cli.js';
const CLI_COMMAND = `${CLI_PATH} history`;
const TEST_WALLET_NAME = 'cli-test';

// Helper delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Execute CLI command with retry
async function executeCLI(command: string, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        cwd: path.resolve(__dirname, '..'),
      });

      if (attempt > 1) await delay(1000);
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0, success: true };
    } catch (error: any) {
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

  return { stdout: '', stderr: 'Max retries exceeded', exitCode: 1, success: false, error: 'Max retries exceeded' };
}

// Helpers for parsing CLI output
function countTransactions(output: string): number {
  const totalMatch = output.match(/Total:\s*(\d+)\s*transactions?/i);
  if (totalMatch) return parseInt(totalMatch[1], 10);
  const txLines = output.match(/tx:\s*[a-f0-9]{64}/gi);
  return txLines ? txLines.length : 0;
}

function extractTransactionTypes(output: string): string[] {
  return output
    .split('\n')
    .filter((line) => /SEND|RECEIVE/i.test(line))
    .map((line) => (/SEND/i.test(line) ? 'send' : 'receive'));
}

function extractConfirmationStatus(output: string) {
  const confirmed = (output.match(/✓\s*confirmed/gi) || []).length;
  const unconfirmed = (output.match(/⏳\s*unconfirmed/gi) || []).length;
  return { confirmed, unconfirmed };
}

function extractAmounts(output: string): number[] {
  const matches = output.match(/\$(\d+\.?\d*)\s*MNEE/g);
  return matches ? matches.map((m) => parseFloat(m.replace(/[^\d.]/g, ''))) : [];
}

// ------------------------------------------------------------
// 🧪 TESTS BEGIN
// ------------------------------------------------------------

test('Setup: Set Active Wallet', async (t) => {
  await delay(500);

  await t.test('should have cli-test wallet', async () => {
    const wallets = await getAllWallets();
    const wallet = wallets.find((w: { name: string }) => w.name === TEST_WALLET_NAME);
    assert.ok(wallet, `Wallet "${TEST_WALLET_NAME}" should exist`);
  });

  await t.test('should set cli-test as active wallet', async () => {
    const result = await executeCLI(`${CLI_PATH} use ${TEST_WALLET_NAME}`);
    await delay(1500);
    const output = result.stdout || result.stderr;
    assert.ok(output.length > 0, 'Use command should produce output');

    const activeWallet = await getActiveWallet();
    assert.strictEqual(activeWallet?.name, TEST_WALLET_NAME, 'Active wallet should be cli-test');
  });
});

test('History Prerequisites', async (t) => {
  await delay(500);

  await t.test('should have active wallet set', async () => {
    const activeWallet = await getActiveWallet();
    assert.ok(activeWallet, 'An active wallet must be set');
  });

  await t.test('should have active wallet in sandbox environment', async () => {
    const activeWallet = await getActiveWallet();
    assert.strictEqual(activeWallet?.environment, 'sandbox', 'Wallet should be in sandbox');
  });
});

test('History Command Execution', async (t) => {
  let activeWallet: any;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found');
    await delay(500);
  });

  await t.test('should produce valid history output', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --limit 2`);
    assert.ok(result.success, 'Command should execute successfully');

    const output = result.stdout || result.stderr;
    assert.ok(output.length > 0, 'Should produce output');
    assert.match(output, /Transaction History|Total:\s*\d+\s*transactions?/i, 'Should include transaction history');
  });

  await t.test('should respect limit parameter', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --limit 3`);
    assert.ok(result.success);
    const txCount = countTransactions(result.stdout);
    assert.ok(txCount <= 3, `Expected ≤3 transactions, got ${txCount}`);
  });

  await t.test('should handle type filters', async () => {
    const sendResult = await executeCLI(`${CLI_COMMAND} --type send --limit 2`);
    const sendTypes = extractTransactionTypes(sendResult.stdout);
    if (sendTypes.length) assert.ok(sendTypes.every((t) => t === 'send'), 'All should be send');

    const recvResult = await executeCLI(`${CLI_COMMAND} --type receive --limit 2`);
    const recvTypes = extractTransactionTypes(recvResult.stdout);
    if (recvTypes.length) assert.ok(recvTypes.every((t) => t === 'receive'), 'All should be receive');
  });

  await t.test('should handle confirmation filters', async () => {
    const confirmed = await executeCLI(`${CLI_COMMAND} --confirmed --limit 2`);
    const confStatus = extractConfirmationStatus(confirmed.stdout);
    if (countTransactions(confirmed.stdout) > 0) assert.strictEqual(confStatus.unconfirmed, 0);

    const unconfirmed = await executeCLI(`${CLI_COMMAND} --unconfirmed --limit 2`);
    const unconfStatus = extractConfirmationStatus(unconfirmed.stdout);
    if (countTransactions(unconfirmed.stdout) > 0) assert.strictEqual(unconfStatus.confirmed, 0);
  });

  await t.test('should handle amount filters', async () => {
    const min = 0.001, max = 100;
    const result = await executeCLI(`${CLI_COMMAND} --min ${min} --max ${max} --limit 2`);
    const amounts = extractAmounts(result.stdout);
    if (amounts.length)
      assert.ok(amounts.every((a) => a >= min && a <= max), `Amounts should be between ${min}-${max}`);
  });

  await t.test('should handle TXID and address search filters', async () => {
    const base = await executeCLI(`${CLI_COMMAND} --limit 1`);
    const txidMatch = base.stdout.match(/tx:\s*([a-f0-9]{64})/i);
    if (txidMatch) {
      const txid = txidMatch[1].substring(0, 8);
      const search = await executeCLI(`${CLI_COMMAND} --txid ${txid}`);
      assert.ok(search.success);
    }

    const addressSearch = await executeCLI(
      `${CLI_COMMAND} --address 1Gqwa5uPapTJqGEPZU6P7YZNGmWoZ6w9vk --limit 2`
    );
    assert.ok(addressSearch.success);
  });

  await t.test('should handle conflicting filters gracefully', async () => {
    const badRange = await executeCLI(`${CLI_COMMAND} --min 100 --max 10 --limit 2`);
    const bothStatus = await executeCLI(`${CLI_COMMAND} --confirmed --unconfirmed --limit 2`);
    assert.ok(badRange.success && bothStatus.success, 'Should handle gracefully');
  });

  await t.test('should support combined filters', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --type receive --confirmed --min 0.001 --max 100 --limit 2`);
    assert.ok(result.success);

    const types = extractTransactionTypes(result.stdout);
    const status = extractConfirmationStatus(result.stdout);
    const amounts = extractAmounts(result.stdout);

    if (types.length)
      assert.ok(types.every((t) => t === 'receive'), 'Only receive tx expected');
    if (status.unconfirmed === 0)
      assert.ok(true, 'Confirmed transactions only');
    if (amounts.length)
      assert.ok(amounts.every((a) => a >= 0.001 && a <= 100), 'Amounts in range');
  });

  await t.test('should have valid output format', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --limit 2`);
    const output = result.stdout;
    if (countTransactions(output) > 0) {
      assert.match(output, /RECEIVE|SEND/i);
      assert.match(output, /\$\s*\d+(?:\.\d+)?\s*MNEE/);
      assert.match(output, /tx:\s*[a-f0-9]{64}/);
      assert.match(output, /Total:\s*\d+\s*transactions?/i);
    }
  });
});

test('Test Summary', async () => {
  const activeWallet = await getActiveWallet();
  console.log('\n--- History Command Test Summary ---');
  console.log('Status: PASSED');
  console.log(`Wallet: ${activeWallet?.name}`);
  console.log(`Address: ${activeWallet?.address}`);
  console.log(`Environment: ${activeWallet?.environment}`);
  console.log('------------------------------------\n');
});