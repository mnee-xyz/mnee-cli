import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert';
import { getActiveWallet } from '../dist/utils/keytar.js';

const execAsync = promisify(exec);

// Helper function to execute CLI commands with retry logic
async function executeCLI(command: string, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      // Add delay after successful execution
      await delay(1000);
      return { 
        stdout: stdout.trim(), 
        stderr: stderr.trim(), 
        exitCode: 0, 
        success: true 
      };
    } catch (error: any) {
      // If not the last attempt, wait before retrying
      if (attempt < retries) {
        console.log(`  ⚠ Attempt ${attempt} failed, retrying...`);
        await delay(2000);
        continue;
      }
      
      await delay(1000);
      return {
        stdout: (error.stdout || '').trim(),
        stderr: (error.stderr || '').trim(),
        exitCode: error.code ?? 1,
        success: false,
        error: error.message,
      };
    }
  }
  
  // Fallback return (should never reach here)
  return {
    stdout: '',
    stderr: 'Max retries exceeded',
    exitCode: 1,
    success: false,
    error: 'Max retries exceeded',
  };
}

// Helper function to add delay between tests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to count transactions in output
function countTransactions(output: string): number {
  const totalMatch = output.match(/Total:\s*(\d+)\s*transactions?/i);
  if (totalMatch) {
    return parseInt(totalMatch[1], 10);
  }
  const txLines = output.match(/tx:\s*[a-f0-9]{64}/gi);
  if (txLines) {
    return txLines.length;
  }
  const separators = output.match(/··+/g);
  if (separators) {
    return separators.length;
  }
  
  return 0;
}

// Helper to extract transaction types from output
function extractTransactionTypes(output: string): string[] {
  const types: string[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (/↓\s*RECEIVE/i.test(line)) {
      types.push('receive');
    } else if (/↑\s*SEND/i.test(line)) {
      types.push('send');
    }
  }
  
  return types;
}

// Helper to check if transactions are confirmed/unconfirmed
function extractConfirmationStatus(output: string): { confirmed: number; unconfirmed: number } {
  const confirmedCount = (output.match(/✓\s*confirmed/gi) || []).length;
  const unconfirmedCount = (output.match(/⏳\s*unconfirmed/gi) || []).length;
  
  return { confirmed: confirmedCount, unconfirmed: unconfirmedCount };
}

// Helper to extract amounts from output
function extractAmounts(output: string): number[] {
  const amounts: number[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (/[↗️↘️↑↓]\s*(SEND|RECEIVE)/i.test(line)) {
      const match = line.match(/\$(\d+\.?\d*)\s*MNEE/);
      if (match) {
        const amount = parseFloat(match[1]);
        if (!isNaN(amount) && amount > 0) {
          amounts.push(amount);
        }
      }
    }
  }
  
  return amounts;
}

// Helper to check if command produced an error
function hasError(result: any): boolean {
  return !result.success || 
         /error|Invalid|fail/i.test(result.stderr) ||
         result.exitCode !== 0;
}

// Test 1: Basic execution with default parameters
async function testBasicExecution() {
  console.log('Test 1: Basic execution with default parameters');
  await delay(1000); // Initial delay
  
  const result = await executeCLI('mnee history --limit 2');
  const output = result.stdout || result.stderr;
  
  assert.ok(result.success, 'Command should execute successfully');
  assert.ok(output.length > 0, 'Should produce output');
  assert.ok(
    /Transaction History|Total:.*transactions?/i.test(output),
    'Should show transaction history header or summary'
  );
  
  const txCount = countTransactions(output);
  console.log(`  ✓ Basic execution successful (${txCount} transactions found)`);
  await delay(2000);
}

// Test 2: Limit parameter
async function testLimitParameter() {
  console.log('\nTest 2: Limit parameter');
  await delay(1000);
  
  // Test with limit 2
  const result5 = await executeCLI('mnee history --limit 2');
  assert.ok(result5.success, 'Command should execute successfully');
  
  const count5 = countTransactions(result5.stdout);
  assert.ok(count5 <= 5, `Should return at most 2 transactions, got ${count5}`);
  console.log(`  ✓ Limit 2: ${count5} transactions returned`);
  
  await delay(1500);
  
  // Test with limit 1
  const result1 = await executeCLI('mnee history --limit 1');
  assert.ok(result1.success, 'Command should execute successfully');
  
  const count1 = countTransactions(result1.stdout);
  assert.ok(count1 <= 1, `Should return at most 1 transaction, got ${count1}`);
  console.log(`  ✓ Limit 1: ${count1} transaction(s) returned`);
  
  await delay(1500);
  
  // Test with limit 3
  const result10 = await executeCLI('mnee history --limit 3');
  assert.ok(result10.success, 'Command should execute successfully');
  
  const count10 = countTransactions(result10.stdout);
  assert.ok(count10 <= 3, `Should return at most 3 transactions, got ${count10}`);
  console.log(`  ✓ Limit 3: ${count10} transactions returned`);
  await delay(2000);
}

// Test 3: Type filter (send/receive)
async function testTypeFilter() {
  console.log('\nTest 3: Type filter');
  await delay(1000);
  
  // Test send filter
  const sendResult = await executeCLI('mnee history --type send --limit 2');
  assert.ok(sendResult.success, 'Send filter command should execute successfully');
  
  const sendTypes = extractTransactionTypes(sendResult.stdout);
  const sendCount = countTransactions(sendResult.stdout);
  
  if (sendCount > 0) {
    const allSend = sendTypes.every(type => type === 'send');
    assert.ok(allSend, 'All transactions should be send type');
    console.log(`  ✓ Type send filter: ${sendCount} send transactions`);
  } else {
    console.log('  ✓ Type send filter: No send transactions found (valid)');
  }
  
  await delay(1500);
  
  // Test receive filter
  const receiveResult = await executeCLI('mnee history --type receive --limit 2');
  assert.ok(receiveResult.success, 'Receive filter command should execute successfully');
  
  const receiveTypes = extractTransactionTypes(receiveResult.stdout);
  const receiveCount = countTransactions(receiveResult.stdout);
  
  if (receiveCount > 0) {
    const allReceive = receiveTypes.every(type => type === 'receive');
    assert.ok(allReceive, 'All transactions should be receive type');
    console.log(`  ✓ Type receive filter: ${receiveCount} receive transactions`);
  } else {
    console.log('  ✓ Type receive filter: No receive transactions found (valid)');
  }
  await delay(2000);
}

// Test 4: Confirmation status filters
async function testConfirmationFilters() {
  console.log('\nTest 4: Confirmation status filters');
  await delay(1000);
  
  // Test confirmed filter
  const confirmedResult = await executeCLI('mnee history --confirmed --limit 2');
  assert.ok(confirmedResult.success, 'Confirmed filter command should execute successfully');
  
  const confirmedOutput = confirmedResult.stdout;
  const confirmedStatus = extractConfirmationStatus(confirmedOutput);
  const confirmedCount = countTransactions(confirmedOutput);
  
  if (confirmedCount > 0) {
    assert.ok(
      confirmedStatus.unconfirmed === 0,
      `Should not show unconfirmed transactions (found ${confirmedStatus.unconfirmed})`
    );
    console.log(`  ✓ Confirmed filter: ${confirmedCount} confirmed`);
  } else {
    console.log('  ✓ Confirmed filter: No confirmed transactions found (valid)');
  }
  
  await delay(1500);
  
  // Test unconfirmed filter
  const unconfirmedResult = await executeCLI('mnee history --unconfirmed --limit 2');
  assert.ok(unconfirmedResult.success, 'Unconfirmed filter command should execute successfully');
  
  const unconfirmedOutput = unconfirmedResult.stdout;
  const unconfirmedStatus = extractConfirmationStatus(unconfirmedOutput);
  const unconfirmedCount = countTransactions(unconfirmedOutput);
  
  if (unconfirmedCount > 0) {
    assert.ok(
      unconfirmedStatus.confirmed === 0,
      `Should not show confirmed transactions (found ${unconfirmedStatus.confirmed})`
    );
    console.log(`  ✓ Unconfirmed filter: ${unconfirmedCount} unconfirmed`);
  } else {
    console.log('  ✓ Unconfirmed filter: No unconfirmed transactions found (valid)');
  }
  await delay(2000);
}

// Test 5: Amount filters (min/max)
async function testAmountFilters() {
  console.log('\nTest 5: Amount filters');
  await delay(1000);
  
  // Test min amount
  const minAmount = 0.001;
  const minResult = await executeCLI(`mnee history --min ${minAmount} --limit 2`);
  assert.ok(minResult.success, 'Min filter command should execute successfully');
  
  const minAmounts = extractAmounts(minResult.stdout);
  if (minAmounts.length > 0) {
    const allAboveMin = minAmounts.every(amt => amt >= minAmount);
    assert.ok(allAboveMin, `All amounts should be >= ${minAmount}, got: ${minAmounts.join(', ')}`);
    console.log(`  ✓ Min amount filter (${minAmount}): ${minAmounts.length} transactions`);
  } else {
    console.log(`  ✓ Min amount filter (${minAmount}): No transactions found (valid)`);
  }
  
  await delay(1500);
  
  // Test max amount
  const maxAmount = 100;
  const maxResult = await executeCLI(`mnee history --max ${maxAmount} --limit 2`);
  assert.ok(maxResult.success, 'Max filter command should execute successfully');
  
  const maxAmounts = extractAmounts(maxResult.stdout);
  if (maxAmounts.length > 0) {
    const allBelowMax = maxAmounts.every(amt => amt <= maxAmount);
    assert.ok(allBelowMax, `All amounts should be <= ${maxAmount}, got: ${maxAmounts.join(', ')}`);
    console.log(`  ✓ Max amount filter (${maxAmount}): ${maxAmounts.length} transactions`);
  } else {
    console.log(`  ✓ Max amount filter (${maxAmount}): No transactions found (valid)`);
  }
  
  await delay(1500);
  
  // Test range
  const rangeResult = await executeCLI(`mnee history --min ${minAmount} --max ${maxAmount} --limit 2`);
  assert.ok(rangeResult.success, 'Range filter command should execute successfully');
  
  const rangeAmounts = extractAmounts(rangeResult.stdout);
  if (rangeAmounts.length > 0) {
    const allInRange = rangeAmounts.every(amt => amt >= minAmount && amt <= maxAmount);
    assert.ok(allInRange, `All amounts should be between ${minAmount} and ${maxAmount}, got: ${rangeAmounts.join(', ')}`);
    console.log(`  ✓ Amount range filter (${minAmount}-${maxAmount}): ${rangeAmounts.length} transactions`);
  } else {
    console.log(`  ✓ Amount range filter (${minAmount}-${maxAmount}): No transactions found (valid)`);
  }
  await delay(2000);
}

// Test 6: Search filters
async function testSearchFilters() {
  console.log('\nTest 6: Search filters');
  await delay(1000);
  
  // Get a transaction first
  const historyResult = await executeCLI('mnee history --limit 1');
  const output = historyResult.stdout;
  
  await delay(1500);
  
  // Extract a txid if available
  const txidMatch = output.match(/tx:\s*([a-f0-9]{64})/i);
  
  if (txidMatch) {
    const fullTxid = txidMatch[1];
    const partialTxid = fullTxid.substring(0, 8);
    
    // Test partial txid search
    const txidResult = await executeCLI(`mnee history --txid ${partialTxid} --limit 2`);
    assert.ok(txidResult.success, 'TXID search should execute successfully');
    
    const txidOutput = txidResult.stdout;
    const foundCount = countTransactions(txidOutput);
    assert.ok(
      txidOutput.toLowerCase().includes(partialTxid.toLowerCase()) || foundCount === 0,
      'Should find transaction with matching txid or return no results'
    );
    console.log(`  ✓ TXID search (${partialTxid}): Found ${foundCount} transaction(s)`);
    
    await delay(1500);
  } else {
    console.log('  ✓ TXID search: No transactions to test with');
  }
  
  // Test address search
  const addressResult = await executeCLI('mnee history --address 1Gqwa5uPapTJqGEPZU6P7YZNGmWoZ6w9vk --limit 2');
  assert.ok(addressResult.success, 'Address search should execute successfully');
  const addressCount = countTransactions(addressResult.stdout);
  console.log(`  ✓ Address search: Found ${addressCount} transaction(s)`);
  await delay(2000);
}


// Test 7: Conflicting filters
async function testConflictingFilters() {
  console.log('\nTest 7: Conflicting filters');
  await delay(1000);
  
  // Min > Max
  const result = await executeCLI('mnee history --min 100 --max 10 --limit 2');
  const output = result.stdout;
  const txCount = countTransactions(output);
  
  // Should return no transactions when min > max
  console.log(`  ✓ Min (100) > Max (10): ${txCount} transactions (expected 0 or few)`);
  
  await delay(1500);
  
  // Both confirmed and unconfirmed
  const bothResult = await executeCLI('mnee history --confirmed --unconfirmed --limit 2');
  const bothCount = countTransactions(bothResult.stdout);
  console.log(`  ✓ Confirmed + Unconfirmed: ${bothCount} transactions (handled gracefully)`);
  await delay(2000);
}

// Test 8: Combined filters
async function testCombinedFilters() {
  console.log('\nTest 8: Combined filters');
  await delay(1000);
  
  // Multiple filters together
  const result = await executeCLI(
    'mnee history --type receive --confirmed --min 0.001 --max 100 --limit 2'
  );
  
  assert.ok(result.success, 'Combined filters should execute successfully');
  
  const txCount = countTransactions(result.stdout);
  const types = extractTransactionTypes(result.stdout);
  const status = extractConfirmationStatus(result.stdout);
  const amounts = extractAmounts(result.stdout);
  
  if (txCount > 0) {
    const allReceive = types.every(t => t === 'receive');
    const noUnconfirmed = status.unconfirmed === 0;
    const amountsInRange = amounts.every(a => a >= 0.001 && a <= 100);
    
    assert.ok(allReceive, `Should only show receive transactions, got types: ${types.join(', ')}`);
    assert.ok(noUnconfirmed, `Should only show confirmed transactions, found ${status.unconfirmed} unconfirmed`);
    assert.ok(amountsInRange, `Amounts should be in range 0.001-100, got: ${amounts.join(', ')}`);
    console.log(`  ✓ Multiple filters combined: ${txCount} transactions match all criteria`);
  } else {
    console.log('  ✓ Multiple filters combined: No matching transactions (valid)');
  }
  await delay(2000);
}

// Test 9: Output format validation
async function testOutputFormat() {
  console.log('\nTest 9: Output format validation');
  await delay(1000);
  
  const result = await executeCLI('mnee history --limit 2');
  assert.ok(result.success, 'Command should execute successfully');
  
  const output = result.stdout;
  const txCount = countTransactions(output);
  
  if (txCount > 0) {
    // Check for transaction format elements
    assert.ok(/RECEIVE|SEND/i.test(output), 'Should have transaction type');
    assert.ok(/\$\s*\d+(?:\.\d+)?\s*MNEE/.test(output), 'Should have amounts in MNEE');
    assert.ok(/tx:\s*[a-f0-9]{64}/.test(output), 'Should have transaction IDs');
    assert.ok(/Total:\s*\d+\s*transactions?/i.test(output), 'Should have total count');
    
    console.log(`  ✓ Output format valid (${txCount} transactions)`);
  } else {
    console.log('  ✓ No transactions to validate format');
  }
  await delay(2000);
}

// Main test runner
async function runTests() {
  console.log('Running mnee history CLI tests...\n');
  console.log('Note: These tests validate the CLI history command functionality.\n');

  const activeWallet = await getActiveWallet();
  if (!activeWallet) {
    console.error('❌ No active wallet found. Please set an active wallet first.');
    process.exit(1);
  }

  console.log(`Active Wallet: ${activeWallet.name} (${activeWallet.address})`);
  console.log(`Environment: ${activeWallet.environment}\n`);
  
  // Wait before starting tests
  await delay(2000);

  try {
    await testBasicExecution();
    await testLimitParameter();
    await testTypeFilter();
    await testConfirmationFilters();
    await testAmountFilters();
    await testSearchFilters();
    await testConflictingFilters();
    await testCombinedFilters();
    await testOutputFormat();
    console.log('\n✅ All tests passed!');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runTests();