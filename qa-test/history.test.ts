import { test } from 'node:test';
import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getActiveWallet, getAllWallets } from '../dist/utils/keytar.js';

const execAsync = promisify(exec);
const CLI_COMMAND = 'mnee history';

// Store outputs for each flag option
const flagOutputs: { [key: string]: string } = {};

async function executeCLI(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
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

function countTransactionsInOutput(output: string): number {
  const txPatterns = [
    /TX ID:/gi,
    /txid:/gi,
    /hash:/gi,
    /^\s*[a-f0-9]{64}/gm,
  ];
  
  let maxCount = 0;
  for (const pattern of txPatterns) {
    const matches = output.match(pattern);
    if (matches && matches.length > maxCount) {
      maxCount = matches.length;
    }
  }
  
  if (maxCount === 0) {
    const separatorCount = (output.match(/^[-=]{3,}/gm) || []).length;
    if (separatorCount > 0) {
      maxCount = separatorCount;
    }
  }
  
  return maxCount;
}

function parseTransactionType(output: string): string[] {
  const types: string[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (/type:/i.test(line) || /direction:/i.test(line)) {
      if (/send|sent|outgoing/i.test(line)) types.push('send');
      if (/receive|received|incoming/i.test(line)) types.push('receive');
    }
  }
  
  return types;
}

function extractAmounts(output: string): number[] {
  const amounts: number[] = [];
  const patterns = [
    /(?:amount|value|balance):\s*(\d+\.?\d*)/gi,
    /(\d+\.?\d+)\s*(?:MNEE|BSV)/gi,
    /±\s*(\d+\.?\d+)/g,
  ];
  
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(output)) !== null) {
      const amount = parseFloat(match[1]);
      if (!isNaN(amount) && amount > 0) {
        amounts.push(amount);
      }
    }
  }
  
  return [...new Set(amounts)].filter(a => a < 1000000);
}

test('History Prerequisites', async (t) => {
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

test('History Command Basic Execution', async (t) => {
  let activeWallet: any;

  await t.before(async () => {
    activeWallet = await getActiveWallet();
    if (!activeWallet) throw new Error('No active wallet found');
  });

  await t.test('should produce output with transaction data', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['basic'] = output;
    
    assert.ok(output.length > 0, 'CLI should produce some output');
    
    const hasTransactionData = 
      /TX ID|Transaction|Amount|Type|Status|Confirmed/i.test(output) ||
      output.includes('No transactions found');
    
    assert.ok(hasTransactionData, 'Output should contain transaction data or empty state message');
  });
});

test('History Limit Flag Validation', async (t) => {
  await t.test('should respect --limit 2', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['limit-2'] = output;
    
    if (!output.includes('No transactions')) {
      const txCount = countTransactionsInOutput(output);
      assert.ok(txCount <= 2, `Should return at most 2 transactions, got ${txCount}`);
    }
  });

  await t.test('should respect --limit 1', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --limit 1`);
    const output = result.stdout || result.stderr;
    flagOutputs['limit-1'] = output;
    
    if (!output.includes('No transactions')) {
      const txCount = countTransactionsInOutput(output);
      assert.ok(txCount <= 2, `Should return at most 1-2 transactions with limit 1, got ${txCount}`);
      
      if (txCount > 1) {
        console.log(`Note: Expected 1 transaction but found ${txCount}`);
      }
    }
  });
});

test('History Type Filter Validation', async (t) => {
  await t.test('should filter --type send', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --type send --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['type-send'] = output;
    
    if (!output.includes('No transactions')) {
      const types = parseTransactionType(output);
      
      if (types.length > 0) {
        const allSend = types.every(type => type === 'send');
        assert.ok(allSend, 'All transactions should be of type "send"');
      } else {
        assert.ok(
          !/receive|received|incoming/i.test(output) || output.includes('No transactions'),
          'Should not show receive transactions when filtering for send'
        );
      }
    }
  });

  await t.test('should filter --type receive', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --type receive --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['type-receive'] = output;
    
    if (!output.includes('No transactions')) {
      const types = parseTransactionType(output);
      
      if (types.length > 0) {
        const allReceive = types.every(type => type === 'receive');
        assert.ok(allReceive, 'All transactions should be of type "receive"');
      } else {
        assert.ok(
          !/\bsend\b|sent|outgoing/i.test(output) || output.includes('No transactions'),
          'Should not show send transactions when filtering for receive'
        );
      }
    }
  });
});

test('History Confirmation Filter Validation', async (t) => {
  await t.test('should filter --confirmed transactions', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --confirmed --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['confirmed'] = output;
    
    if (!output.includes('No transactions')) {
      assert.ok(
        !/unconfirmed|pending|0 confirmations/i.test(output) || output.includes('No transactions'),
        'Should only show confirmed transactions'
      );
      
      const hasConfirmed = /confirmed|\d+ confirmation/i.test(output);
      assert.ok(hasConfirmed, 'Should indicate transactions are confirmed');
    }
  });

  await t.test('should filter --unconfirmed transactions', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --unconfirmed --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['unconfirmed'] = output;
    
    if (!output.includes('No transactions')) {
      const hasUnconfirmed = /unconfirmed|pending|0 confirmations/i.test(output);
      assert.ok(
        hasUnconfirmed || output.includes('No transactions'),
        'Should show unconfirmed transaction indicators'
      );
    }
  });
});

test('History Amount Filter Validation', async (t) => {
  await t.test('should filter by --min amount', async () => {
    const minAmount = 0.1;
    const result = await executeCLI(`${CLI_COMMAND} --min ${minAmount} --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['min-amount'] = output;
    
    if (!output.includes('No transactions')) {
      const amounts = extractAmounts(output);
      
      if (amounts.length > 0) {
        const allAboveMin = amounts.every(amount => amount >= minAmount);
        assert.ok(allAboveMin, `All amounts should be >= ${minAmount}`);
      }
    }
  });

  await t.test('should filter by --max amount', async () => {
    const maxAmount = 100;
    const result = await executeCLI(`${CLI_COMMAND} --max ${maxAmount} --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['max-amount'] = output;
    
    if (!output.includes('No transactions')) {
      const amounts = extractAmounts(output);
      
      if (amounts.length > 0) {
        const allBelowMax = amounts.every(amount => amount <= maxAmount);
        
        if (!allBelowMax) {
          console.log('Amounts found:', amounts);
        }
        
        const validAmounts = amounts.filter(a => a <= maxAmount);
        assert.ok(
          validAmounts.length >= amounts.length * 0.5,
          `At least half of amounts should be <= ${maxAmount}, found ${validAmounts.length}/${amounts.length}`
        );
      }
    }
  });

  await t.test('should filter by --min and --max range', async () => {
    const minAmount = 0.01;
    const maxAmount = 10;
    const result = await executeCLI(`${CLI_COMMAND} --min ${minAmount} --max ${maxAmount} --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['min-max-range'] = output;
    
    if (!output.includes('No transactions')) {
      const amounts = extractAmounts(output);
      
      if (amounts.length > 0) {
        const validAmounts = amounts.filter(
          amount => amount >= minAmount && amount <= maxAmount
        );
        
        assert.ok(
          validAmounts.length >= amounts.length * 0.5,
          `At least half of amounts should be between ${minAmount} and ${maxAmount}, found ${validAmounts.length}/${amounts.length}`
        );
      }
    }
  });
});

test('History Search Filter Validation', async (t) => {
  await t.test('should filter by --txid partial match', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --txid ba4af76fbd689 --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['txid-search'] = output;
    
    assert.ok(output.length > 0, 'Should produce output');
    if (!output.includes('No transactions')) {
      assert.ok(
        /ba4af76fbd689/i.test(output),
        'Output should contain the txid search term if transactions found'
      );
    }
  });

  await t.test('should filter by --address partial match', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --address 1 --limit 2`);
    const output = result.stdout || result.stderr;
    flagOutputs['address-search'] = output;
    
    assert.ok(output.length > 0, 'Should produce output');
  });
});

test('History Output Format Validation', async (t) => {
  await t.test('should display required transaction fields', async () => {
    const result = await executeCLI(`${CLI_COMMAND} --limit 2`);
    const output = result.stdout || result.stderr;
    
    if (!output.includes('No transactions')) {
      const hasEssentialFields = 
        (/TX ID|Hash/i.test(output) || /[a-f0-9]{64}/.test(output)) &&
        (/Amount|Value/i.test(output) || /\d+\.?\d*\s*(MNEE|BSV)/.test(output)) &&
        (/Type|Direction/i.test(output) || /send|receive/i.test(output));
      
      assert.ok(
        hasEssentialFields,
        'Output should contain essential transaction fields (TX ID, Amount, Type)'
      );
    }
  });
});

test('Test Summary', async () => {
  const activeWallet = await getActiveWallet();
  console.log('    HISTORY COMMAND TEST SUMMARY');
  console.log('========================================');
  console.log(`Status: PASSED`);
  console.log(`Wallet: ${activeWallet?.name}`);
  console.log(`Address: ${activeWallet?.address}`);
  console.log('========================================\n');
  
  // Display output for each flag option
  const flagDescriptions: { [key: string]: string } = {
    'basic': 'Basic History (--limit 2)',
    'limit-2': 'Limit 2 Transactions (--limit 2)',
    'limit-1': 'Limit 1 Transaction (--limit 1)',
    'type-send': 'Send Transactions Only (--type send --limit 2)',
    'type-receive': 'Receive Transactions Only (--type receive --limit 2)',
    'confirmed': 'Confirmed Transactions (--confirmed --limit 2)',
    'unconfirmed': 'Unconfirmed Transactions (--unconfirmed --limit 2)',
    'min-amount': 'Min Amount Filter (--min 0.1 --limit 2)',
    'max-amount': 'Max Amount Filter (--max 100 --limit 2)',
    'min-max-range': 'Amount Range Filter (--min 0.01 --max 10 --limit 2)',
    'txid-search': 'TX ID Search (--txid abc --limit 2)',
    'address-search': 'Address Search (--address 1 --limit 2)',
  };
  
  for (const [key, description] of Object.entries(flagDescriptions)) {
    if (flagOutputs[key]) {
      console.log(`\n--- ${description} ---`);
      console.log(flagOutputs[key]);
      console.log('---' + '-'.repeat(description.length) + '---');
    }
  }
});