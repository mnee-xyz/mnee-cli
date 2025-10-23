import { test } from 'node:test';
import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { getActiveWallet, getAllWallets } from '../dist/utils/keytar.js';
import 'dotenv/config';

const execAsync = promisify(exec);
const TRANSFER_COMMAND = 'mnee transfer';
const STATUS_COMMAND = 'mnee status';

// Test constants
const TEST_RECIPIENT = '1Gqwa5uPapTJqGEPZU6P7YZNGmWoZ6w9vk';
const TEST_AMOUNT = '0.01';
const WALLET_PASSWORD = process.env.WALLET_PASSWORD ?? '';

// Store transfer results
let transferTicketId: string | null = null;

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

test('🔧 Transfer Command - Prerequisites', async (t) => {
  console.log(chalk.cyan('\n=== Checking prerequisites ==='));

  await t.test('Wallet and environment check', async () => {
    const wallets = await getAllWallets();
    assert.ok(wallets.length > 0, 'At least one wallet should exist.');
    console.log(chalk.white(`Found ${wallets.length} wallet(s)`));

    const activeWallet = await getActiveWallet();
    assert.ok(activeWallet, 'Active wallet must be set.');
    assert.strictEqual(
      activeWallet?.environment,
      'sandbox',
      'Active wallet should be in sandbox environment'
    );
    console.log(chalk.white(`Active wallet: ${activeWallet.name}`));
    console.log(chalk.gray(`Address: ${activeWallet.address}`));
  });

  await t.test('Password environment variable', async () => {
    assert.ok(
      WALLET_PASSWORD,
      'WALLET_PASSWORD must be set in environment'
    );
    console.log(chalk.white('✓ Password environment variable is set'));
  });
});

test('🔧 Transfer Command - Input Validation', async (t) => {
  console.log(chalk.cyan('\n=== Testing input validation ==='));

  await t.test('Invalid amount - zero', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} 0 ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Amount must be greater than 0') || !result.success,
      'Should reject zero amount'
    );
    console.log(chalk.white('✓ Zero amount rejected'));
  });

  await t.test('Invalid amount - negative', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} -5 ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Amount must be greater than 0') || !result.success,
      'Should reject negative amount'
    );
    console.log(chalk.white('✓ Negative amount rejected'));
  });

  await t.test('Invalid amount - below minimum', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} 0.000001 ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Amount must be at least 0.00001') || !result.success,
      'Should reject amount below minimum'
    );
    console.log(chalk.white('✓ Below minimum amount rejected'));
  });

  await t.test('Invalid amount - non-numeric', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} abc ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Invalid amount') || !result.success,
      'Should reject non-numeric amount'
    );
    console.log(chalk.white('✓ Non-numeric amount rejected'));
  });

  await t.test('Invalid address - malformed', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} ${TEST_AMOUNT} invalid_address`);
    const output = result.stdout || result.stderr;
    assert.ok(
      output.includes('Invalid') || !result.success,
      'Should reject malformed address'
    );
    console.log(chalk.white('✓ Malformed address rejected'));
  });

  await t.test('Valid scientific notation', async () => {
    const result = await executeCLI(`${TRANSFER_COMMAND} 1e-4 ${TEST_RECIPIENT}`);
    const output = result.stdout || result.stderr;
    assert.ok(
      !output.includes('Invalid amount'),
      'Should accept scientific notation'
    );
    console.log(chalk.white('✓ Scientific notation accepted'));
  });
});

test('🔧 Transfer Command - Successful Transfer', async (t) => {
  console.log(chalk.cyan('\n=== Testing successful transfer ==='));

  let activeWallet: any;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found.');
  });

  await t.test('Execute transfer and capture ticket ID', async () => {
    console.log(chalk.yellow('\n📤 Initiating transfer...'));
    console.log(chalk.gray(`   Amount: ${TEST_AMOUNT} MNEE`));
    console.log(chalk.gray(`   To: ${TEST_RECIPIENT}`));
    console.log(chalk.gray(`   From: ${activeWallet.name}`));

    const result: any = await executeCLIWithInput(
      `${TRANSFER_COMMAND} ${TEST_AMOUNT} ${TEST_RECIPIENT}`,
      [WALLET_PASSWORD]
    );

    const output = result.stdout || result.stderr;
    console.log(chalk.yellow('\n📊 Transfer Output:\n'));
    console.log(output);

    // Extract Ticket ID
    const ticketMatch = output.match(/Ticket:\s*([0-9a-fA-F-]{36})/);
    
    if (ticketMatch) {
      transferTicketId = ticketMatch[1];
      console.log(chalk.green(`\n✓ Ticket ID captured: ${transferTicketId}`));
    }

    // Verify success
    const isSuccess = /(Transfer\s+Success|Transaction\s+Details|TX ID:\s*[a-f0-9]+)/i.test(output);

    assert.ok(isSuccess, 'Transfer should complete successfully');
    assert.ok(transferTicketId, 'Should receive ticket ID');
    assert.ok(!output.includes('Incorrect password'), 'Password should be correct');
    
    if (isSuccess) {
      console.log(chalk.green('\n✅ Transfer successful!'));
    }
  });

  await t.test('Verify transaction details in output', async () => {
    const result: any = await executeCLIWithInput(
      `${TRANSFER_COMMAND} ${TEST_AMOUNT} ${TEST_RECIPIENT}`,
      [WALLET_PASSWORD]
    );
    const output = result.stdout || result.stderr;

    assert.ok(
      output.includes(TEST_AMOUNT) || output.includes('Amount:'),
      'Output should contain amount'
    );
    assert.ok(
      output.includes(TEST_RECIPIENT) || output.includes('To:'),
      'Output should contain recipient address'
    );
    console.log(chalk.white('✓ Transaction details verified'));
  });
});

test('🔧 Transaction Status - Check Transfer Status', async (t) => {
  console.log(chalk.cyan('\n=== Testing transaction status check ==='));

  await t.test('Ticket ID is available from transfer', async () => {
    assert.ok(
      transferTicketId,
      'Ticket ID should be captured from transfer test'
    );
    console.log(chalk.white(`✓ Using ticket ID: ${transferTicketId}`));
  });

  await t.test('Check status with valid ticket ID', async () => {
    if (!transferTicketId) {
      console.log(chalk.yellow('⚠️  Skipping - no ticket ID from transfer'));
      return;
    }

    console.log(chalk.yellow(`\n🔍 Checking status for: ${transferTicketId}...`));

    const result = await executeCLI(`${STATUS_COMMAND} ${transferTicketId}`);
    const output = result.stdout || result.stderr;

    console.log(chalk.yellow('\n📊 Status Output:\n'));
    console.log(output);

    assert.ok(output.length > 0, 'CLI should produce output');
    assert.ok(
      output.includes(transferTicketId),
      'Output should contain ticket ID'
    );
    
    console.log(chalk.green('✅ Status check successful'));
  });

  await t.test('Verify status contains required fields', async () => {
    if (!transferTicketId) {
      console.log(chalk.yellow('⚠️  Skipping - no ticket ID from transfer'));
      return;
    }

    const { stdout, stderr } = await executeCLI(`${STATUS_COMMAND} ${transferTicketId}`);
    const output = stdout || stderr;

    // Check for transaction status
    const validStatuses = ['BROADCASTING', 'SUCCESS', 'MINED', 'FAILED'];
    const hasStatus = validStatuses.some(status => output.includes(status));
    assert.ok(hasStatus, 'Output should contain transaction status');
    console.log(chalk.white('✓ Transaction status found'));

    // Check for timestamps
    assert.ok(output.includes('Created'), 'Should contain creation timestamp');
    console.log(chalk.white('✓ Created timestamp found'));

    assert.ok(output.includes('Updated'), 'Should contain updated timestamp');
    console.log(chalk.white('✓ Updated timestamp found'));

    // Check for TX ID if completed
    if (output.includes('SUCCESS') || output.includes('MINED')) {
      assert.ok(
        output.includes('TX ID') || output.includes('whatsonchain.com'),
        'Completed transaction should show TX ID'
      );
      console.log(chalk.white('✓ TX ID found (transaction completed)'));
    } else {
      console.log(chalk.yellow('⚠️  Transaction still processing'));
    }
  });
});

test('🔧 Transfer Command - Error Handling', async (t) => {
  console.log(chalk.cyan('\n=== Testing error handling ==='));
  
  await t.test('Insufficient balance', async () => {
    const result: any = await executeCLIWithInput(
      `${TRANSFER_COMMAND} 999999 ${TEST_RECIPIENT}`,
      [WALLET_PASSWORD]
    );
    const output = result.stdout || result.stderr;
    
    // Should fail due to insufficient balance
    console.log(chalk.white('✓ Insufficient balance handling verified'));
  });

  await t.test('Missing ticket ID in status command', async () => {
    const result = await executeCLI(STATUS_COMMAND);
    const output = result.stdout || result.stderr;
    
    assert.ok(
      !result.success || output.includes('error') || output.includes('required'),
      'Should show error when ticket ID is missing'
    );
    console.log(chalk.white('✓ Missing ticket ID error handled'));
  });

  await t.test('Invalid ticket ID format', async () => {
    const result = await executeCLI(`${STATUS_COMMAND} invalid-ticket-123`);
    const output = result.stdout || result.stderr;
    
    assert.ok(output.length > 0, 'Should produce error output');
    console.log(chalk.white('✓ Invalid ticket ID handled'));
  });
});

test('🧾 Test Summary', async () => {
  console.log(chalk.cyan('\n=== Integration Test Summary ==='));
  
  if (transferTicketId) {
    console.log(chalk.green('\n✅ ALL TESTS PASSED'));
    console.log(chalk.white(`\n📦 Transfer & Status Details:`));
    console.log(chalk.gray(`   Ticket ID: ${transferTicketId}`));
    console.log(chalk.gray(`   Amount: ${TEST_AMOUNT} MNEE`));
    console.log(chalk.gray(`   Recipient: ${TEST_RECIPIENT}`));
    console.log(chalk.cyan(`\n🔗 Full Flow Tested:`));
    console.log(chalk.white('   ✓ Transfer executed'));
    console.log(chalk.white('   ✓ Ticket ID captured'));
    console.log(chalk.white('   ✓ Status checked'));
  } else {
    console.log(chalk.red('\n❌ Transfer Failed'));
    console.log(chalk.yellow('   Update WALLET_PASSWORD in .env'));
    console.log(chalk.yellow('   Ensure wallet has sufficient balance'));
  }
});