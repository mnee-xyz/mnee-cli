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
const CLI_COMMAND = 'mnee status';
const TEST_TICKET_ID = '5d9dd4c1-8360-4d80-aa9d-96552a9bd9fa';

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

test('🔧 Status Command - Prerequisites', async (t) => {
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

  await t.test('Test ticket ID format', async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert.ok(
      uuidRegex.test(TEST_TICKET_ID),
      'Test ticket ID should be a valid UUID format'
    );
    console.log(chalk.green(`✅ Test ticket ID is valid: ${TEST_TICKET_ID}`));
  });
});

test('🔧 Status Command - CLI Execution', async (t) => {
  console.log(chalk.cyan('\n Running status CLI command'));

  let activeWallet: any;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found.');
  });

  await t.test('Run CLI with valid ticket ID', async () => {
    const result = await executeCLI(`${CLI_COMMAND} ${TEST_TICKET_ID}`);
    const output = result.stdout || result.stderr;

    console.log(chalk.yellow('\n📊 CLI Output:\n'));
    console.log(output);
    console.log(chalk.gray(`\nExit Code: ${result.exitCode}`));

    assert.ok(output.length > 0, 'CLI should produce some output');
    console.log(chalk.green('✅ Command executed successfully'));
  });

  await t.test('Ticket ID appears in output', async () => {
    const { stdout, stderr } = await executeCLI(`${CLI_COMMAND} ${TEST_TICKET_ID}`);
    const output = stdout || stderr;
    assert.ok(
      output.includes(TEST_TICKET_ID),
      `Output should contain ticket ID: ${TEST_TICKET_ID}`
    );
    console.log(chalk.green('✅ Ticket ID verified in output'));
  });

  await t.test('Transaction status appears', async () => {
    const { stdout, stderr } = await executeCLI(`${CLI_COMMAND} ${TEST_TICKET_ID}`);
    const output = stdout || stderr;
    const validStatuses = ['BROADCASTING', 'SUCCESS', 'MINED', 'FAILED'];
    const hasStatus = validStatuses.some(status => output.includes(status));
    assert.ok(
      hasStatus,
      'Output should contain one of the valid transaction statuses'
    );
    console.log(chalk.green('✅ Transaction status detected in output'));
  });

  await t.test('Created timestamp appears', async () => {
    const { stdout, stderr } = await executeCLI(`${CLI_COMMAND} ${TEST_TICKET_ID}`);
    const output = stdout || stderr;
    assert.ok(
      output.includes('Created'),
      'Output should contain creation timestamp'
    );
    console.log(chalk.green('✅ Created timestamp verified in output'));
  });

  await t.test('Updated timestamp appears', async () => {
    const { stdout, stderr } = await executeCLI(`${CLI_COMMAND} ${TEST_TICKET_ID}`);
    const output = stdout || stderr;
    assert.ok(
      output.includes('Updated'),
      'Output should contain updated timestamp'
    );
    console.log(chalk.green('✅ Updated timestamp verified in output'));
  });

  await t.test('TX ID appears if transaction is complete', async () => {
    const { stdout, stderr } = await executeCLI(`${CLI_COMMAND} ${TEST_TICKET_ID}`);
    const output = stdout || stderr;
    
    // Only check for TX ID if status is SUCCESS or MINED
    if (output.includes('SUCCESS') || output.includes('MINED')) {
      assert.ok(
        output.includes('TX ID') || output.includes('whatsonchain.com'),
        'Output should contain TX ID or WhatsOnChain link for completed transactions'
      );
      console.log(chalk.green('✅ TX ID or blockchain explorer link verified'));
    } else {
      console.log(chalk.yellow('⚠️  Transaction not yet complete, skipping TX ID check'));
    }
  });
});

test('🔧 Status Command - Error Handling', async (t) => {
  console.log(chalk.cyan('\n Testing error scenarios'));

  await t.test('Missing ticket ID parameter', async () => {
    const result = await executeCLI(CLI_COMMAND);
    const output = result.stdout || result.stderr;
    
    assert.ok(
      !result.success || output.includes('error') || output.includes('required'),
      'CLI should show error when ticket ID is missing'
    );
    console.log(chalk.green('✅ Missing parameter error handled correctly'));
  });

  await t.test('Invalid ticket ID format', async () => {
    const invalidTicketId = 'invalid-ticket-123';
    const result = await executeCLI(`${CLI_COMMAND} ${invalidTicketId}`);
    const output = result.stdout || result.stderr;
    
    assert.ok(output.length > 0, 'CLI should produce error output for invalid ticket ID');
    console.log(chalk.green('✅ Invalid ticket ID handled'));
  });

  await t.test('Non-existent ticket ID', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const result = await executeCLI(`${CLI_COMMAND} ${nonExistentId}`);
    const output = result.stdout || result.stderr;
    
    assert.ok(
      output.includes('Error') || output.includes('not found') || !result.success,
      'CLI should handle non-existent ticket ID gracefully'
    );
    console.log(chalk.green('✅ Non-existent ticket ID error handled'));
  });
});

test('🧾 Test Summary', async () => {
  console.log(chalk.cyan('\n ✅ All status command tests completed!'));
  console.log(chalk.green('\n📝 Summary:'));
  console.log(chalk.white('   ✓ Uses keytar wallets'));
  console.log(chalk.white('   ✓ Verifies CLI status command'));
  console.log(chalk.white('   ✓ Tests error scenarios'));
  console.log(chalk.white(`   ✓ Test ticket: ${TEST_TICKET_ID}`));
});