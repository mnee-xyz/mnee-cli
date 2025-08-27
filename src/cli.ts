#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import crypto from 'crypto';
import { PrivateKey } from '@bsv/sdk';
import { decryptPrivateKey, encryptPrivateKey } from './utils/crypto.js';
import {
  getActiveWallet,
  getAllWallets,
  saveWallets,
  setActiveWallet,
  WalletEnvironment,
  WalletInfo,
  getWalletByAddress,
  setPrivateKey,
  deletePrivateKey,
  getPrivateKey,
  clearActiveWallet,
  getLegacyWallet,
  deleteLegacyWallet,
} from './utils/keytar.js';
import { getVersion, singleLineLogger } from './utils/helper.js';
import Mnee, { SendMNEE, TxHistory, TransferStatus } from 'mnee';
import { loadConfig, saveConfig, clearConfig, startAuthFlow, getProfile, logout as logoutApi } from './utils/auth.js';

const apiUrl = 'https://api-developer.mnee.net'; // Use https://api-stg-developer.mnee.net if testing in mnee stage env (need VPN to access)

const getMneeInstance = (environment: WalletEnvironment, apiKey?: string): Mnee => {
  return new Mnee({ environment, apiKey });
};

const getTxStatus = async (mneeInstance: Mnee, ticketId: string): Promise<TransferStatus> => {
  return await mneeInstance.getTxStatus(ticketId);
};

const pollForTxStatus = async (
  mneeInstance: Mnee,
  ticketId: string,
  onStatusUpdate?: (status: TransferStatus) => void,
): Promise<TransferStatus> => {
  const maxAttempts = 60; // 5 minutes with 5 second intervals
  let attempts = 0;
  let lastStatus: string | null = null;

  while (attempts < maxAttempts) {
    try {
      const status = await getTxStatus(mneeInstance, ticketId);

      // Call the optional callback with status updates
      if (onStatusUpdate && status.status !== lastStatus) {
        onStatusUpdate(status);
        lastStatus = status.status;
      }

      // Return when status is no longer BROADCASTING
      if (status.status !== 'BROADCASTING') {
        return status;
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    } catch (error) {
      console.error('Error polling transaction status:', error);
      throw error;
    }
  }

  throw new Error('Transaction status polling timed out after 5 minutes');
};

const safePrompt = async (questions: any) => {
  try {
    return await inquirer.prompt(questions);
  } catch {
    console.log('\n❌ Operation cancelled by user.');
    process.exit(1);
  }
};

const program = new Command();
if (!process.argv.slice(2).length) {
  console.log(` __       __  __    __  ________  ________         ______   __        ______ 
/  \\     /  |/  \\  /  |/        |/        |       /      \\ /  |      /      |
$$  \\   /$$ |$$  \\ $$ |$$$$$$$$/ $$$$$$$$/       /$$$$$$  |$$ |      $$$$$$/ 
$$$  \\ /$$$ |$$$  \\$$ |$$ |__    $$ |__          $$ |  $$/ $$ |        $$ |  
$$$$  /$$$$ |$$$$  $$ |$$    |   $$    |         $$ |      $$ |        $$ |  
$$ $$ $$/$$ |$$ $$ $$ |$$$$$/    $$$$$/          $$ |   __ $$ |        $$ |  
$$ |$$$/ $$ |$$ |$$$$ |$$ |_____ $$ |_____       $$ \\__/  |$$ |_____  _$$ |_ 
$$ | $/  $$ |$$ | $$$ |$$       |$$       |      $$    $$/ $$       |/ $$   |
$$/      $$/ $$/   $$/ $$$$$$$$/ $$$$$$$$/        $$$$$$/  $$$$$$$$/ $$$$$$/

`);
}

program.name('mnee').description('CLI for interacting with MNEE tokens').version(getVersion());

// Add error handling for the main program
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  process.exit(err.exitCode);
});

program
  .command('create')
  .description('Generate a new wallet and store keys securely')
  .action(async () => {
    try {
      const existingWallets = await getAllWallets();

      const { environment } = await safePrompt([
        {
          type: 'list',
          name: 'environment',
          message: 'Select wallet environment:',
          choices: [
            { name: 'Production', value: 'production' },
            { name: 'Sandbox', value: 'sandbox' },
          ],
          default: 'production',
        },
      ]);

      const { walletName } = await safePrompt([
        {
          type: 'input',
          name: 'walletName',
          message: `Enter a name for your ${environment} wallet:`,
          default: `${environment}-wallet-${Date.now()}`,
          validate: (input: string) => {
            const validation = validateWalletName(input);
            if (!validation.isValid) {
              return validation.error || 'Invalid wallet name';
            }

            if (existingWallets.some((w) => w.name.toLowerCase() === input.toLowerCase())) {
              return `A wallet with name "${input}" already exists (names are case-insensitive)`;
            }

            return true;
          },
        },
      ]);

      const entropy = crypto.randomBytes(32);
      const privateKey = PrivateKey.fromString(entropy.toString('hex'));
      const address = privateKey.toAddress();

      const { password, confirmPassword } = await safePrompt([
        {
          type: 'password',
          name: 'password',
          message: 'Set a password for your wallet:',
          mask: '*',
          validate: (input: string) => {
            if (input.length < 8) {
              return 'Password must be at least 8 characters long';
            }

            // Check for at least one uppercase letter
            if (!/[A-Z]/.test(input)) {
              return 'Password must contain at least one uppercase letter';
            }

            // Check for at least one lowercase letter
            if (!/[a-z]/.test(input)) {
              return 'Password must contain at least one lowercase letter';
            }

            // Check for at least one number
            if (!/[0-9]/.test(input)) {
              return 'Password must contain at least one number';
            }

            // Check for at least one special character
            if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(input)) {
              return 'Password must contain at least one special character';
            }

            return true;
          },
        },
        {
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm your password:',
          mask: '*',
        },
      ]);

      if (password !== confirmPassword) {
        console.error('❌ Passwords do not match. Try again.');
        return;
      }

      const encryptedKey = encryptPrivateKey(privateKey.toString(), password);

      const wallets = await getAllWallets();

      wallets.forEach((wallet) => {
        wallet.isActive = false;
      });

      const newWallet: WalletInfo = {
        address,
        environment,
        name: walletName,
        isActive: true,
      };

      wallets.push(newWallet);
      await saveWallets(wallets);
      await setPrivateKey(address, encryptedKey);
      await setActiveWallet(newWallet);

      console.log('\n✅ Wallet created successfully!');
      console.log(`\nName: ${walletName}`);
      console.log(`Environment: ${environment}`);
      console.log(`Address: ${address}\n`);
      console.log('This wallet is now your active wallet.');
    } catch (error) {
      console.error('\n❌ Error creating wallet:', error);
    }
  });

program
  .command('address')
  .description('Retrieve your wallet address')
  .action(async () => {
    const activeWallet = await getActiveWallet();

    if (!activeWallet) {
      console.error(
        '❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.',
      );
      return;
    }

    console.log(`\nActive Wallet: ${activeWallet.name} (${activeWallet.environment})`);
    console.log(`Address: ${activeWallet.address}\n`);
  });

program
  .command('balance')
  .description('Get the balance of the wallet')
  .action(async () => {
    const activeWallet = await getActiveWallet();

    if (!activeWallet) {
      console.error(
        '❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.',
      );
      return;
    }

    singleLineLogger.start(`Fetching balance for ${activeWallet.name} (${activeWallet.environment})...`);

    try {
      const mneeInstance = getMneeInstance(activeWallet.environment);
      const { decimalAmount } = await mneeInstance.balance(activeWallet.address);

      singleLineLogger.done(`\n$${decimalAmount} MNEE\n`);
    } catch (error) {
      console.error('Error fetching balance:', error);
      singleLineLogger.done('');
    }
  });

program
  .command('history')
  .description('Get the history of the wallet')
  .option('-u, --unconfirmed', 'Show only unconfirmed transactions')
  .option('-c, --confirmed', 'Show only confirmed transactions')
  // TODO: Future enhancement - Add filtering options:
  // - Filter by transaction type (send/receive)
  // - Filter by status (confirmed/unconfirmed)
  // - Filter by transaction ID
  // - Filter by counterparty address
  // - Filter by amount range
  .action(async (options) => {
    const activeWallet = await getActiveWallet();

    if (!activeWallet) {
      console.error(
        '❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.',
      );
      return;
    }

    singleLineLogger.start(`Fetching history for ${activeWallet.name} (${activeWallet.environment})...`);

    try {
      const mneeInstance = getMneeInstance(activeWallet.environment);
      let nextScore = undefined;
      let hasMore = true;
      let history: TxHistory[] = [];
      let attempts = 0;
      const maxAttempts = 20; // Safety limit to prevent infinite loops

      while (hasMore && attempts < maxAttempts) {
        const { history: newHistory, nextScore: newNextScore } = await mneeInstance.recentTxHistory(
          activeWallet.address,
          nextScore,
          100,
          'desc',
        );

        if (newNextScore === nextScore && newNextScore !== undefined) break;

        history.push(...newHistory);
        nextScore = newNextScore;
        hasMore = nextScore !== 0 && nextScore !== undefined;
        attempts++;
      }

      if (attempts >= maxAttempts) {
        console.log('Reached maximum number of attempts. Some history may be missing.');
      }

      // Deduplicate transactions by txid (keep the one with the highest score)
      const txMap = new Map<string, TxHistory>();
      history.forEach((tx) => {
        const existing = txMap.get(tx.txid);
        if (!existing || tx.score > existing.score) {
          txMap.set(tx.txid, tx);
        }
      });
      history = Array.from(txMap.values());

      // Filter based on options
      if (options.unconfirmed) {
        history = history.filter((tx) => tx.status === 'unconfirmed');
        console.log(JSON.stringify(history, null, 2));
        singleLineLogger.done(
          `\n${history.length} unconfirmed transaction${history.length !== 1 ? 's' : ''} fetched successfully!\n`,
        );
      } else if (options.confirmed) {
        history = history.filter((tx) => tx.status === 'confirmed');
        console.log(JSON.stringify(history, null, 2));
        singleLineLogger.done(
          `\n${history.length} confirmed transaction${history.length !== 1 ? 's' : ''} fetched successfully!\n`,
        );
      } else {
        // Show all transactions by default
        console.log(JSON.stringify(history, null, 2));
        singleLineLogger.done(
          `\n${history.length} transaction${history.length !== 1 ? 's' : ''} fetched successfully!\n`,
        );
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      singleLineLogger.done('');
    }
  });

program
  .command('transfer')
  .description('Transfer MNEE to another address')
  .action(async () => {
    try {
      const activeWallet = await getActiveWallet();

      if (!activeWallet) {
        console.error(
          '❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.',
        );
        return;
      }

      const { amount, toAddress } = await safePrompt([
        {
          type: 'input',
          name: 'amount',
          message: 'Enter the amount to transfer:',
          validate: (input: string) => {
            // Check if the input is a valid number format
            const trimmed = input.trim();
            if (!trimmed) {
              return 'Amount is required';
            }

            // Regex to match valid decimal numbers (including scientific notation)
            const validNumberRegex = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
            if (!validNumberRegex.test(trimmed)) {
              return 'Invalid amount. Please enter a valid number (e.g., 10, 10.5, 1.5e-3)';
            }

            const num = parseFloat(trimmed);
            if (isNaN(num)) {
              return 'Invalid amount. Please enter a valid number';
            }

            if (num <= 0) {
              return 'Amount must be greater than 0';
            }

            if (num < 0.00001) {
              return 'Amount must be at least 0.00001 MNEE';
            }

            return true;
          },
        },
        {
          type: 'input',
          name: 'toAddress',
          message: "Enter the recipient's address:",
        },
      ]);

      const { password } = await safePrompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your wallet password:',
          mask: '*',
        },
      ]);

      const encryptedKey = await getPrivateKey(activeWallet.address);
      if (!encryptedKey) {
        console.error('❌ Private key not found for this wallet.');
        return;
      }

      const privateKeyHex = decryptPrivateKey(encryptedKey, password);
      if (!privateKeyHex) {
        console.error('❌ Incorrect password! Decryption failed.');
        return;
      }

      const privateKey = PrivateKey.fromString(privateKeyHex);
      const request = [{ address: toAddress, amount: parseFloat(amount) }] as SendMNEE[];

      singleLineLogger.start(`Transferring MNEE from ${activeWallet.name} (${activeWallet.environment})...`);

      try {
        const mneeInstance = getMneeInstance(activeWallet.environment);
        // Explicitly set broadcast to true to ensure we get a ticketId
        const response = await mneeInstance.transfer(request, privateKey.toWif());

        // Check what type of response we got
        if (response.ticketId) {
          // We got a ticket ID, poll for status
          singleLineLogger.done(`\n✅ Transfer initiated. Ticket ID: ${response.ticketId}`);
          singleLineLogger.start('⏳ Waiting for transaction to be processed...');

          // Poll for transaction status
          const finalStatus = await pollForTxStatus(mneeInstance, response.ticketId, (status) => {
            switch (status.status) {
              case 'BROADCASTING':
                singleLineLogger.start('📡 Broadcasting transaction...');
                break;
              case 'SUCCESS':
                singleLineLogger.done('\n✅ Transaction successful!');
                break;
              case 'MINED':
                singleLineLogger.done('\n⛏️ Transaction mined!');
                break;
              case 'FAILED':
                singleLineLogger.done(`\n❌ Transaction failed: ${status.errors || 'Unknown error'}`);
                break;
            }
          });

          if (finalStatus.status === 'SUCCESS' || finalStatus.status === 'MINED') {
            console.log(`\nTransaction ID: ${finalStatus.tx_id}`);
            console.log(`View on WhatsOnChain: https://whatsonchain.com/tx/${finalStatus.tx_id}?tab=m8eqcrbs\n`);
          } else if (finalStatus.status === 'FAILED') {
            console.error(`\nTransaction failed: ${finalStatus.errors || 'Unknown error'}\n`);
          }
        } else if (response.rawtx) {
          // We got a raw transaction instead (shouldn't happen with broadcast: true)
          singleLineLogger.done('\n✅ Transaction created.');
          console.log('\n⚠️  Raw transaction returned instead of ticket ID.');
          console.log('This might indicate the transaction needs to be submitted manually.');
          console.log('Raw transaction hex:', response.rawtx.substring(0, 50) + '...\n');
        } else {
          // No valid response
          singleLineLogger.done('❌ Transfer failed. No ticket ID or transaction returned.');
        }
      } catch (error: any) {
        console.log(error);
        singleLineLogger.done(
          `❌ Transfer failed. ${
            error && error.message
              ? error.message.includes('status: 423')
                ? 'The sending or receiving address may be frozen or blacklisted. Please visit https://mnee.io and contact support for questions or concerns.'
                : 'Please try again.'
              : 'Please try again.'
          }`,
        );
        process.exit(1);
      }
    } catch (error) {
      console.log('\n❌ Operation interrupted.');
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check the status of a transaction using its ticket ID')
  .argument('<ticketId>', 'The ticket ID to check status for')
  .action(async (ticketId) => {
    try {
      const activeWallet = await getActiveWallet();

      if (!activeWallet) {
        console.error(
          '❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.',
        );
        return;
      }

      singleLineLogger.start(`Checking status for ticket: ${ticketId}...`);

      try {
        const mneeInstance = getMneeInstance(activeWallet.environment);
        const status = await getTxStatus(mneeInstance, ticketId);

        singleLineLogger.done('');

        console.log('\n📋 Transaction Status:');
        console.log('---------------------');
        console.log(`Ticket ID: ${status.id}`);
        console.log(`Status: ${status.status}`);

        if (status.tx_id) {
          console.log(`Transaction ID: ${status.tx_id}`);
          console.log(`View on WhatsOnChain: https://whatsonchain.com/tx/${status.tx_id}`);
        }

        console.log(`Created: ${new Date(status.createdAt).toLocaleString()}`);
        console.log(`Updated: ${new Date(status.updatedAt).toLocaleString()}`);

        if (status.errors) {
          console.log(`Errors: ${status.errors}`);
        }

        // Provide status-specific messages
        switch (status.status) {
          case 'BROADCASTING':
            console.log('\n⏳ Transaction is being broadcast to the network...');
            break;
          case 'SUCCESS':
            console.log('\n✅ Transaction successfully broadcast!');
            break;
          case 'MINED':
            console.log('\n⛏️ Transaction has been mined into a block!');
            break;
          case 'FAILED':
            console.log('\n❌ Transaction failed.');
            break;
        }
        console.log('');
      } catch (error: any) {
        singleLineLogger.done('');
        console.error(`❌ Error checking status: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('\n❌ Error:', error);
    }
  });

program
  .command('export')
  .description('Decrypt and retrieve your private key in WIF format')
  .action(async () => {
    try {
      const activeWallet = await getActiveWallet();

      if (!activeWallet) {
        console.error(
          '❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.',
        );
        return;
      }

      const { password } = await safePrompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your wallet password:',
          mask: '*',
        },
      ]);

      const encryptedKey = await getPrivateKey(activeWallet.address);

      if (!encryptedKey) {
        console.error('❌ Private key not found for this wallet.');
        return;
      }

      const { confirm } = await safePrompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'You are about to expose your private key. Continue?',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('🚫 Operation cancelled.');
        return;
      }

      const privateKeyHex = decryptPrivateKey(encryptedKey, password);
      if (!privateKeyHex) {
        console.error('❌ Incorrect password! Decryption failed.');
        return;
      }

      const privateKey = PrivateKey.fromString(privateKeyHex);
      const wif = privateKey.toWif();

      console.log(`\nWallet Name: ${activeWallet.name}`);
      console.log(`Environment: ${activeWallet.environment}`);
      console.log(`Wallet Address:\n${activeWallet.address}`);
      console.log(`\nWIF Private Key:\n${wif}`);
      console.log('\n🚨 Keep this key SAFE! Never share it with anyone.\n');
    } catch (error) {
      console.error('\n❌ Error exporting private key:', error);
    }
  });

program
  .command('delete')
  .description('Delete a wallet')
  .argument('<walletName>', 'Name of the wallet to delete (defaults to active wallet)')
  .action(async (walletName) => {
    try {
      const wallets = await getAllWallets();
      const activeWallet = await getActiveWallet();

      if (wallets.length === 0) {
        console.error('❌ No wallets found.');
        return;
      }

      if (!walletName && activeWallet) {
        walletName = activeWallet.name;
      }

      if (!walletName) {
        console.error('❌ No wallet specified and no active wallet found.');
        return;
      }

      const wallet = wallets.find((w) => w.name === walletName);

      if (!wallet) {
        console.error(`❌ Wallet "${walletName}" not found.`);
        return;
      }

      const { confirm } = await safePrompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete wallet "${walletName}"? This action cannot be undone.`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('🚫 Operation cancelled.');
        return;
      }

      const encryptedKey = await getPrivateKey(wallet.address);
      if (!encryptedKey) {
        console.error('❌ Private key not found for this wallet.');
        return;
      }

      const { password } = await safePrompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your wallet password to confirm deletion:',
          mask: '*',
        },
      ]);

      let decryptedKey: string | null = null;
      try {
        decryptedKey = decryptPrivateKey(encryptedKey, password);
      } catch (error) {
        console.error('❌ Incorrect password! Deletion cancelled.');
        return;
      }

      if (!decryptedKey) {
        console.error('❌ Password verification failed. Deletion cancelled.');
        return;
      }

      const updatedWallets = wallets.filter((w) => w.name !== walletName);

      if (wallet.isActive) {
        if (updatedWallets.length > 0) {
          updatedWallets[0].isActive = true;
          await setActiveWallet(updatedWallets[0]);
          console.log(`\n✅ Active wallet switched to: ${updatedWallets[0].name}`);
        } else {
          await clearActiveWallet();
          console.log('\nℹ️ No active wallet set. Create a new wallet with `mnee create`.');
        }
      }

      // Delete the wallet's private key first
      await deletePrivateKey(wallet.address);

      // Then update the wallets list
      await saveWallets(updatedWallets);

      console.log(`\n🗑️ Wallet "${walletName}" deleted successfully!`);
    } catch (error) {
      console.error('\n❌ Error deleting wallet:', error);
    }
  });

program
  .command('list')
  .description('List all your wallets and optionally switch to a different wallet')
  .action(async () => {
    try {
      const wallets = await getAllWallets();
      const activeWallet = await getActiveWallet();

      if (wallets.length === 0) {
        console.log('\n❌ No wallets found. Run `mnee create` to create a wallet.');
        return;
      }

      console.log('\nYour Wallets:');
      console.log('-------------');

      wallets.forEach((wallet, index) => {
        const activeIndicator = wallet.isActive ? ' (Active) ✅' : '';
        console.log(`${index + 1}. ${wallet.name}${activeIndicator}`);
        console.log(`   Environment: ${wallet.environment}`);
        console.log(`   Address: ${wallet.address}`);
        console.log('');
      });

      if (activeWallet) {
        console.log(`Current active wallet: ${activeWallet.name} (${activeWallet.environment})`);
      }

      const { wantToSwitch } = await safePrompt([
        {
          type: 'confirm',
          name: 'wantToSwitch',
          message: 'Would you like to switch to a different wallet?',
          default: false,
        },
      ]);

      if (wantToSwitch) {
        const { selectedWallet } = await safePrompt([
          {
            type: 'list',
            name: 'selectedWallet',
            message: 'Select a wallet to switch to:',
            choices: wallets.map((wallet) => ({
              name: `${wallet.name} | ${wallet.environment} | ${wallet.address.slice(0, 5)}...${wallet.address.slice(
                -4,
              )}`,
              value: wallet.name,
            })),
          },
        ]);

        const wallet = wallets.find((w) => w.name === selectedWallet);
        if (wallet) {
          wallets.forEach((w) => {
            w.isActive = w.name === selectedWallet;
          });

          await saveWallets(wallets);
          await setActiveWallet(wallet);

          console.log(`\n✅ Switched to wallet: ${wallet.name}`);
          console.log(`Environment: ${wallet.environment}`);
          console.log(`Address: ${wallet.address}`);
        }
      }
    } catch (error) {
      console.error('\n❌ Error listing wallets:', error);
    }
  });

program
  .command('use')
  .description('Switch to a different wallet')
  .argument('<walletName>', 'Name of the wallet to switch to')
  .action(async (walletName) => {
    try {
      const wallets = await getAllWallets();

      if (wallets.length === 0) {
        console.error('❌ No wallets found. Run `mnee create` to create a wallet.');
        return;
      }

      const wallet = wallets.find((w) => w.name.toLowerCase() === walletName.toLowerCase());

      if (!wallet) {
        console.error(`❌ Wallet "${walletName}" not found.`);
        console.log('\nAvailable wallets:');
        wallets.forEach((w) => {
          console.log(`  - ${w.name} (${w.environment})`);
        });
        return;
      }

      // Update all wallets to set the active state
      wallets.forEach((w) => {
        w.isActive = w.name === wallet.name;
      });

      await saveWallets(wallets);
      await setActiveWallet(wallet);

      console.log(`\n✅ Switched to wallet: ${wallet.name}`);
      console.log(`Environment: ${wallet.environment}`);
      console.log(`Address: ${wallet.address}`);
    } catch (error) {
      console.error('\n❌ Error switching wallet:', error);
    }
  });

program
  .command('rename')
  .description('Rename a wallet')
  .argument('<oldName>', 'Current name of the wallet')
  .argument('<newName>', 'New name for the wallet')
  .action(async (oldName, newName) => {
    try {
      const validation = validateWalletName(newName);
      if (!validation.isValid) {
        console.error(`❌ ${validation.error}`);
        return;
      }

      const wallets = await getAllWallets();

      if (wallets.length === 0) {
        console.error('❌ No wallets found. Run `mnee create` to create a wallet.');
        return;
      }

      const wallet = wallets.find((w) => w.name.toLowerCase() === oldName.toLowerCase());

      if (!wallet) {
        console.error(`❌ Wallet "${oldName}" not found.`);
        console.log('Run `mnee list` to see your available wallets.');
        return;
      }

      if (wallets.some((w) => w.name.toLowerCase() === newName.toLowerCase() && w.name !== oldName)) {
        console.error(`❌ A wallet with name "${newName}" already exists (names are case-insensitive).`);
        return;
      }

      wallet.name = newName;
      await saveWallets(wallets);

      const activeWallet = await getActiveWallet();
      if (activeWallet && activeWallet.name === oldName) {
        await setActiveWallet(wallet);
      }

      console.log(`\n✅ Wallet renamed from "${oldName}" to "${newName}"`);

      if (wallet.isActive) {
        console.log('This is your active wallet.');
      }
    } catch (error) {
      console.error('\n❌ Error renaming wallet:', error);
    }
  });

program
  .command('import')
  .description('Import an existing wallet using a WIF private key')
  .action(async () => {
    try {
      const existingWallets = await getAllWallets();

      const { environment } = await safePrompt([
        {
          type: 'list',
          name: 'environment',
          message: 'Select wallet environment:',
          choices: [
            { name: 'Production', value: 'production' },
            { name: 'Sandbox', value: 'sandbox' },
          ],
          default: 'production',
        },
      ]);

      const { wifKey } = await safePrompt([
        {
          type: 'password',
          name: 'wifKey',
          message: 'Enter your WIF private key:',
          mask: '*',
        },
      ]);

      let privateKey: PrivateKey;
      try {
        privateKey = PrivateKey.fromWif(wifKey);
      } catch (error) {
        console.error('❌ Invalid WIF key. Please check and try again.');
        return;
      }

      const address = privateKey.toAddress();

      // Check if wallet with this address already exists
      const existingWallet = await getWalletByAddress(address);
      if (existingWallet) {
        console.error(`\n❌ A wallet with address ${address} already exists.`);
        console.log(`\nTo use this wallet, run: mnee use ${existingWallet.name}`);
        return;
      }

      const { walletName } = await safePrompt([
        {
          type: 'input',
          name: 'walletName',
          message: `Enter a name for your ${environment} wallet:`,
          default: `${environment}-wallet-${Date.now()}`,
          validate: (input: string) => {
            const validation = validateWalletName(input);
            if (!validation.isValid) {
              return validation.error || 'Invalid wallet name';
            }

            if (existingWallets.some((w) => w.name.toLowerCase() === input.toLowerCase())) {
              return `A wallet with name "${input}" already exists (names are case-insensitive)`;
            }

            return true;
          },
        },
      ]);

      const { password, confirmPassword } = await safePrompt([
        {
          type: 'password',
          name: 'password',
          message: 'Set a password to encrypt your wallet:',
          mask: '*',
          validate: (input: string) => {
            if (input.length < 8) {
              return 'Password must be at least 8 characters long';
            }

            // Check for at least one uppercase letter
            if (!/[A-Z]/.test(input)) {
              return 'Password must contain at least one uppercase letter';
            }

            // Check for at least one lowercase letter
            if (!/[a-z]/.test(input)) {
              return 'Password must contain at least one lowercase letter';
            }

            // Check for at least one number
            if (!/[0-9]/.test(input)) {
              return 'Password must contain at least one number';
            }

            // Check for at least one special character
            if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(input)) {
              return 'Password must contain at least one special character';
            }

            return true;
          },
        },
        {
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm your password:',
          mask: '*',
        },
      ]);

      if (password !== confirmPassword) {
        console.error('❌ Passwords do not match. Try again.');
        return;
      }

      const encryptedKey = encryptPrivateKey(privateKey.toString(), password);

      const newWallet: WalletInfo = {
        address,
        environment,
        name: walletName,
        isActive: true,
      };

      // Deactivate all other wallets
      existingWallets.forEach((wallet) => {
        wallet.isActive = false;
      });

      existingWallets.push(newWallet);
      await saveWallets(existingWallets);
      await setPrivateKey(address, encryptedKey);
      await setActiveWallet(newWallet);

      console.log('\n✅ Wallet imported successfully!');
      console.log(`\nName: ${walletName}`);
      console.log(`Environment: ${environment}`);
      console.log(`Address: ${address}\n`);
      console.log('This wallet is now your active wallet.');
    } catch (error) {
      console.error('\n❌ Error importing wallet:', error);
    }
  });

program
  .command('login')
  .description('Authenticate with MNEE Developer Portal')
  .action(async () => {
    try {
      // Check if already logged in
      const config = await loadConfig();

      if (config.token) {
        try {
          // Validate the token is still valid
          const profile = await getProfile(apiUrl, config.token);
          console.log(`\n✅ Already logged in as ${profile.email}`);
          console.log('\nTo log in as a different user, run `mnee logout` first.');
          return;
        } catch (error) {
          // Token is invalid, continue with login flow
          console.log('⚠️  Previous session expired. Starting new authentication...\n');
        }
      }

      console.log('🔐 Starting authentication flow...');
      console.log('Press Ctrl+C to cancel at any time.\n');

      const result = await startAuthFlow(apiUrl);

      // Update config with new auth info
      config.token = result.token;
      config.email = result.user.email;

      await saveConfig(config);

      console.log(`\n✅ Successfully authenticated as ${result.user.email}`);
      console.log('\nYou can now use CLI commands like:');
      console.log('  mnee faucet - Request sandbox tokens (sandbox wallets only)');
      console.log('  mnee whoami - Show current user');
      console.log('  mnee logout - Sign out');
    } catch (error: any) {
      console.error('\n❌ Authentication failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Sign out from MNEE Developer Portal')
  .action(async () => {
    try {
      const config = await loadConfig();

      if (!config.token) {
        console.log('ℹ️ Not logged in.');
        return;
      }

      // Call logout API
      await logoutApi(apiUrl, config.token);

      // Clear local config
      await clearConfig();

      console.log('✅ Successfully logged out.');
    } catch (error: any) {
      console.error('❌ Error during logout:', error.message);
    }
  });

program
  .command('whoami')
  .description('Show current authenticated user')
  .action(async () => {
    try {
      const config = await loadConfig();

      if (!config.token) {
        console.log('❌ Not logged in. Run `mnee login` to authenticate.');
        return;
      }

      try {
        const profile = await getProfile(apiUrl, config.token);

        console.log('\n👤 Current User:');
        console.log(`Email: ${profile.email}`);
        console.log(`Name: ${profile.name || 'Not set'}`);
        if (profile.company) {
          console.log(`Company: ${profile.company}`);
        }
        console.log('');
      } catch (error) {
        console.error('❌ Failed to get user profile. Your session may have expired.');
        console.log('Run `mnee login` to authenticate again.');
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
    }
  });

program
  .command('faucet')
  .description('Request sandbox tokens (requires authentication)')
  .option('-a, --address <address>', 'Deposit address (defaults to active wallet)')
  .action(async (options) => {
    try {
      const activeWallet = await getActiveWallet();

      if (!activeWallet) {
        console.error(
          '❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.',
        );
        return;
      }
      const config = await loadConfig();

      if (!config.token) {
        console.log('❌ Not logged in. Run `mnee login` to authenticate.');
        return;
      }

      // Get deposit address
      let depositAddress = options.address;

      if (!depositAddress) {
        depositAddress = activeWallet.address;
        console.log(`Using active wallet address: ${depositAddress}`);
      }

      if (activeWallet.environment === 'production') {
        console.log('❌ The faucet is only available in sandbox mode.');
        console.log('Production tokens must be purchased.');
        return;
      }

      console.log('\n💧 Requesting sandbox tokens...');

      const response = await fetch(`${apiUrl}/faucet/cli`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ depositAddress }),
      });

      const result = (await response.json()) as { success: boolean; message: string; amount: number; txid: string };

      if (result.success) {
        console.log(`\n✅ Success! ${result.amount || 10} MNEE tokens sent.`);
        console.log(`Transaction ID: ${result.txid}`);
        console.log(`\nView on WhatsOnChain: https://whatsonchain.com/tx/${result.txid}?tab=m8eqcrbs`);
      } else {
        console.error(`\n❌ ${result.message || 'Failed to request tokens'}`);
      }
    } catch (error: any) {
      console.error('\n❌ Faucet request failed:', error.message);
    }
  });

const migrateOldWallets = async (): Promise<void> => {
  try {
    const { address: oldAddress, privateKey: oldEncryptedKey } = await getLegacyWallet();

    if (!oldAddress || !oldEncryptedKey) {
      return;
    }

    const existingWallets = await getAllWallets();
    const addresses = existingWallets.map((w) => w.address.trim());

    console.log('👍 Legacy wallet found:', oldAddress);
    console.log('🔍 Checking for existing wallets...');
    console.log('📦 Existing wallet addresses:', addresses);

    const alreadyMigrated = addresses.includes(oldAddress.trim());

    if (alreadyMigrated) {
      console.log('ℹ️ Legacy wallet already exists in new format. Skipping migration.');
      await deleteLegacyWallet();
      return;
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `A legacy wallet (${oldAddress}) was found. Do you want to migrate it?`,
        default: true,
      },
    ]);

    if (!confirm) {
      console.log('🚫 Migration cancelled.');
      return;
    }

    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Enter your wallet password to decrypt legacy wallet:',
        mask: '*',
      },
    ]);

    const decryptedKey = decryptPrivateKey(oldEncryptedKey, password);
    if (!decryptedKey) {
      console.error('❌ Failed to decrypt old private key. Migration aborted.');
      return;
    }

    const reEncryptedKey = encryptPrivateKey(decryptedKey, password);

    // Use unique name if "legacy-wallet" is taken
    let baseName = 'legacy-wallet';
    let name = baseName;
    let suffix = 1;
    while (existingWallets.some((w) => w.name === name)) {
      name = `${baseName}-${suffix++}`;
    }

    const newWallet: WalletInfo = {
      address: oldAddress,
      environment: 'production',
      name,
      isActive: existingWallets.length === 0, // Only auto-activate if no other wallets
    };

    const updatedWallets = [...existingWallets, newWallet];
    await saveWallets(updatedWallets);
    if (newWallet.isActive) {
      await setActiveWallet(newWallet);
    }

    await setPrivateKey(oldAddress, reEncryptedKey);
    await deleteLegacyWallet();

    console.log(`✅ Migration complete! Wallet added as "${name}".`);
    if (newWallet.isActive) {
      console.log('This wallet is now your active wallet.');
    } else {
      console.log(`To use it, run: mnee use ${name}`);
    }
  } catch (error) {
    console.error('\n❌ Error during wallet migration:', error);
  }
};

const validateWalletName = (name: string): { isValid: boolean; error?: string } => {
  if (!name || name.trim() === '') {
    return { isValid: false, error: 'Wallet name cannot be empty' };
  }

  if (name.includes(' ')) {
    return { isValid: false, error: 'Wallet name cannot contain spaces' };
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
    return {
      isValid: false,
      error: 'Wallet name can only contain letters, numbers, hyphens, and underscores',
    };
  }

  if (name.length < 1 || name.length > 50) {
    return {
      isValid: false,
      error: 'Wallet name must be between 1 and 50 characters',
    };
  }

  return { isValid: true };
};

await migrateOldWallets();

program.parse(process.argv);

process.on('SIGINT', () => {
  console.log('\n👋 Exiting program gracefully...');
  process.exit(0);
});
