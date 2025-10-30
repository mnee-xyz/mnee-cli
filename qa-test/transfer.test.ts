import { test } from 'node:test';
import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getActiveWallet, getAllWallets } from '../dist/utils/keytar.js';
import 'dotenv/config';

const execAsync = promisify(exec);
const TRANSFER_COMMAND = 'mnee transfer';
const STATUS_COMMAND = 'mnee status';

// Test constants
const TEST_RECIPIENT = '1Gqwa5uPapTJqGEPZU6P7YZNGmWoZ6w9vk';
const TEST_AMOUNT = '0.1';
const WALLET_PASSWORD = process.env.WALLET_PASSWORD ?? '';

// Store transfer results
let transferTicketId: string | null = null;
let transferOutput = '';
let statusOutput = '';

async function executeCLI(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
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

async function executeCLIWithInput(command: string, inputs: string[]) {
  return new Promise((resolve) => {
    const child = exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: error ? error.code ?? 1 : 0,
        success: !error,
        error: error?.message,
      });
    });

    inputs.forEach((input, index) => {
      setTimeout(() => {
        child.stdin?.write(input + '\n');
        if (index === inputs.length - 1) {
          child.stdin?.end();
        }
      }, index * 500);
    });
  });
}

test('Transfer Prerequisites', async (t) => {
  await t.test('should have wallet and environment configured', async () => {
    const wallets = await getAllWallets();
    assert.ok(wallets.length > 0, 'At least one wallet should exist');

    const activeWallet = await getActiveWallet();
    assert.ok(activeWallet, 'Active wallet must be set');
    assert.strictEqual(
      activeWallet?.environment,
      'sandbox',
      'Active wallet should be in sandbox environment'
    );
  });

  await t.test('should have password environment variable', async () => {
    assert.ok(WALLET_PASSWORD, 'WALLET_PASSWORD must be set in environment');
  });
});

test('Transfer Input Validation', async (t) => {
  await t.test('should reject zero amount', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} 0 ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Amount must be greater than 0') || !result.success,
      'Should reject zero amount'
    );
  });

  await t.test('should reject negative amount', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} -5 ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Amount must be greater than 0') || !result.success,
      'Should reject negative amount'
    );
  });

  await t.test('should reject amount below minimum', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} 0.000001 ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Amount must be at least 0.00001') || !result.success,
      'Should reject amount below minimum'
    );
  });

  await t.test('should reject non-numeric amount', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} abc ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Invalid amount') || !result.success,
      'Should reject non-numeric amount'
    );
  });

  await t.test('should reject malformed address', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} ${TEST_AMOUNT} invalid_address`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Invalid') || !result.success,
      'Should reject malformed address'
    );
  });
});

test('Transfer Execution', async (t) => {
  let activeWallet: any;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found');
  });

  await t.test('should execute transfer and capture ticket ID', async () => {
    const result: any = await executeCLIWithInput(
      `${TRANSFER_COMMAND} ${TEST_AMOUNT} ${TEST_RECIPIENT}`,
      [WALLET_PASSWORD]
    );

    const output = result.stdout || result.stderr;
    transferOutput = output; // Store for summary

    // Extract Ticket ID
    const ticketMatch = output.match(/Ticket:\s*([0-9a-fA-F-]{36})/);
    
    if (ticketMatch) {
      transferTicketId = ticketMatch[1];
    }

    // Verify success
    const isSuccess = /(Transfer\s+Success|Transaction\s+Details|TX ID:\s*[a-f0-9]+)/i.test(output);

    assert.ok(isSuccess, 'Transfer should complete successfully');
    assert.ok(transferTicketId, 'Should receive ticket ID');
    assert.ok(!output.includes('Incorrect password'), 'Password should be correct');
  });
});

test('Transaction Status Check', async (t) => {
  await t.test('should have ticket ID from transfer', async () => {
    assert.ok(transferTicketId, 'Ticket ID should be captured from transfer test');
  });

  await t.test('should check status with valid ticket ID', async () => {
    if (!transferTicketId) {
      console.log('Skipping - no ticket ID from transfer');
      return;
    }

    const result = await executeCLI(`${STATUS_COMMAND} ${transferTicketId}`);
    const output = result.stdout || result.stderr;
    statusOutput = output; // Store for summary

    assert.ok(output.length > 0, 'CLI should produce output');
    assert.ok(output.includes(transferTicketId), 'Output should contain ticket ID');
  });

  await t.test('should contain required status fields', async () => {
    if (!transferTicketId) {
      console.log('Skipping - no ticket ID from transfer');
      return;
    }

    const { stdout, stderr } = await executeCLI(`${STATUS_COMMAND} ${transferTicketId}`);
    const output = stdout || stderr;

    // Check for transaction status
    const validStatuses = ['BROADCASTING', 'SUCCESS', 'MINED', 'FAILED'];
    const hasStatus = validStatuses.some(status => output.includes(status));
    assert.ok(hasStatus, 'Output should contain transaction status');

    // Check for timestamps
    assert.ok(output.includes('Created'), 'Should contain creation timestamp');
    assert.ok(output.includes('Updated'), 'Should contain updated timestamp');

    // Check for TX ID if completed
    if (output.includes('SUCCESS') || output.includes('MINED')) {
      assert.ok(
        output.includes('TX ID') || output.includes('whatsonchain.com'),
        'Completed transaction should show TX ID'
      );
    }
  });
});

test('Transfer Error Handling', async (t) => {
  await t.test('should error when ticket ID is missing', async () => {
    const result = await executeCLI(STATUS_COMMAND);
    const output = result.stdout || result.stderr;
    
    assert.ok(
      !result.success || output.includes('error') || output.includes('required'),
      'Should show error when ticket ID is missing'
    );
  });

  await t.test('should handle invalid ticket ID format', async () => {
    const result = await executeCLI(`${STATUS_COMMAND} invalid-ticket-123`);
    const output = result.stdout || result.stderr;
    
    assert.ok(output.length > 0, 'Should produce error output');
  });
});

test('Test Summary', async () => {
  console.log('\n--- Transfer & Status Test Summary ---');
  
  if (transferTicketId) {
    console.log('Status: PASSED');
    console.log(`Ticket ID: ${transferTicketId}`);
    console.log(`Amount: ${TEST_AMOUNT} MNEE`);
    console.log(`Recipient: ${TEST_RECIPIENT}`);
  } else {
    console.log('Status: FAILED');
    console.log('Note: Check WALLET_PASSWORD in .env and wallet balance');
  }
  
  console.log('--------------------------------------');
  
  if (transferOutput) {
    console.log('\n--- Transfer Output ---');
    console.log(transferOutput);
    console.log('-----------------------');
  }
  
  if (statusOutput) {
    console.log('\n--- Status Output ---');
    console.log(statusOutput);
    console.log('---------------------\n');
  }
});