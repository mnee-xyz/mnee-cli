#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import crypto from 'crypto';
import { PrivateKey, Utils } from '@bsv/sdk';
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
import { getVersion } from './utils/helper.js';
import {
  colors,
  icons,
  createSpinner,
  showBox,
  formatAddress,
  formatAmount,
  formatLink,
  showWelcome,
  animateSuccess,
  startTransactionAnimation,
  startAirdropAnimation,
  table,
} from './utils/ui.js';
import Mnee, { SendMNEE, TxHistory, TransferStatus } from 'mnee';
import { loadConfig, saveConfig, clearConfig, startAuthFlow, getProfile, logout as logoutApi } from './utils/auth.js';

const apiUrl = 'https://api-stg-developer.mnee.net'; // Use https://api-stg-developer.mnee.net if testing in mnee stage env (need VPN to access)

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
    console.log(`\n${icons.error} ${colors.error('Operation cancelled by user.')}`);
    process.exit(1);
  }
};

const program = new Command();
if (!process.argv.slice(2).length) {
  await showWelcome();
  process.exit(0); // Exit after showing welcome, don't show help
}

program
  .name('mnee')
  .description(colors.muted('CLI for interacting with MNEE tokens'))
  .version(getVersion())
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => cmd.name() + ' ' + cmd.usage(),
  })
  .addHelpText('before', `\n${colors.highlight('MNEE CLI')} ${colors.muted(`v${getVersion()}`)}\n`)
  .addHelpText(
    'after',
    `\n${colors.muted('Examples:')}\n` +
      `  ${colors.primary('mnee create')}              ${colors.muted('# Create a new wallet')}\n` +
      `  ${colors.primary('mnee balance')}             ${colors.muted('# Check wallet balance')}\n` +
      `  ${colors.primary('mnee transfer 10 1A...')}   ${colors.muted('# Quick transfer')}\n` +
      `  ${colors.primary('mnee list')}                ${colors.muted('# List all wallets')}\n\n` +
      `${colors.muted('For more help:')} ${colors.primary('mnee <command> --help')}\n`,
  );

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
  .option('-s, --sandbox', 'Create a sandbox wallet')
  .option('-p, --production', 'Create a production wallet')
  .action(async (options) => {
    try {
      const existingWallets = await getAllWallets();

      // Determine environment from options or prompt
      let environment: WalletEnvironment;
      if (options.sandbox) {
        environment = 'sandbox';
      } else if (options.production) {
        environment = 'production';
      } else {
        const result = await safePrompt([
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
        environment = result.environment;
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

      animateSuccess('Wallet created successfully!');

      setTimeout(() => {
        showBox(
          `${icons.wallet} ${colors.highlight('Wallet Details')}\n\n` +
            `${icons.dot} Name: ${colors.primary(walletName)}\n` +
            `${icons.dot} Environment: ${
              environment === 'production' ? colors.success(environment) : colors.warning(environment)
            }\n` +
            `${icons.dot} Address: ${colors.muted(address)}\n\n` +
            `${icons.check} ${colors.success('This wallet is now active')}`,
          'New Wallet Created',
          'success',
        );
      }, 1200);
    } catch (error) {
      console.error(`\n${icons.error} ${colors.error('Error creating wallet:')}`, error);
    }
  });

program
  .command('address')
  .description('Retrieve your wallet address')
  .action(async () => {
    const activeWallet = await getActiveWallet();

    if (!activeWallet) {
      console.error(
        `${icons.error} ${colors.error('No active wallet found.')} Run ${colors.primary(
          'mnee create',
        )} first or ${colors.primary('mnee use <wallet-name>')} to select a wallet.`,
      );
      return;
    }

    showBox(
      `${icons.wallet} ${colors.highlight('Active Wallet')}\n\n` +
        `${icons.dot} Name: ${colors.primary(activeWallet.name)}\n` +
        `${icons.dot} Environment: ${
          activeWallet.environment === 'production'
            ? colors.success(activeWallet.environment)
            : colors.warning(activeWallet.environment)
        }\n` +
        `${icons.dot} Address: ${colors.muted(activeWallet.address)}`,
      'Wallet Address',
      'info',
    );
  });

program
  .command('balance')
  .description('Get the balance of the wallet')
  .action(async () => {
    const activeWallet = await getActiveWallet();

    if (!activeWallet) {
      console.error(
        `${icons.error} ${colors.error('No active wallet found.')} Run ${colors.primary(
          'mnee create',
        )} first or ${colors.primary('mnee use <wallet-name>')} to select a wallet.`,
      );
      return;
    }

    const spinner = createSpinner(
      `Fetching balance for ${colors.primary(activeWallet.name)} (${activeWallet.environment})...`,
    );
    spinner.start();

    try {
      const mneeInstance = getMneeInstance(activeWallet.environment);
      const { decimalAmount } = await mneeInstance.balance(activeWallet.address);

      spinner.succeed(`Balance retrieved!`);

      showBox(
        `${icons.money} ${colors.highlight('Wallet Balance')}\n\n` +
          `${formatAmount(decimalAmount)}\n\n` +
          `${icons.wallet} ${colors.muted(activeWallet.name)}\n` +
          `${icons.arrow} ${colors.muted(formatAddress(activeWallet.address))}`,
        'Balance',
        'success',
      );
    } catch (error) {
      spinner.fail(colors.error('Error fetching balance'));
      console.error(error);
    }
  });

program
  .command('history')
  .description('Get transaction history with filtering options')
  .option('-u, --unconfirmed', 'Show only unconfirmed transactions')
  .option('-c, --confirmed', 'Show only confirmed transactions')
  .option('-l, --limit <number>', 'Show only the N most recent transactions (e.g., -l 10)', parseInt)
  .option('-t, --type <type>', 'Filter by type: "send" or "receive"')
  .option('--txid <txid>', 'Search by transaction ID (partial match)')
  .option('--address <address>', 'Filter by counterparty address (partial match)')
  .option('--min <amount>', 'Show transactions >= amount (e.g., --min 0.5)', parseFloat)
  .option('--max <amount>', 'Show transactions <= amount (e.g., --max 100)', parseFloat)
  .action(async (options) => {
    const activeWallet = await getActiveWallet();

    if (!activeWallet) {
      console.error(
        `${icons.error} ${colors.error('No active wallet found.')} Run ${colors.primary(
          'mnee create',
        )} first or ${colors.primary('mnee use <wallet-name>')} to select a wallet.`,
      );
      return;
    }

    const spinner = createSpinner(
      `Fetching history for ${colors.primary(activeWallet.name)} (${activeWallet.environment})...`,
    );
    spinner.start();

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

      // Apply filters based on options
      if (options.unconfirmed) {
        history = history.filter((tx) => tx.status === 'unconfirmed');
      } else if (options.confirmed) {
        history = history.filter((tx) => tx.status === 'confirmed');
      }

      // Filter by transaction type
      if (options.type) {
        const type = options.type.toLowerCase();
        if (type === 'send' || type === 'receive') {
          history = history.filter((tx) => tx.type === type);
        }
      }

      // Filter by transaction ID (partial match)
      if (options.txid) {
        history = history.filter((tx) => tx.txid.toLowerCase().includes(options.txid.toLowerCase()));
      }

      // Filter by counterparty address
      if (options.address) {
        history = history.filter((tx) =>
          tx.counterparties?.some((cp) => cp.address.toLowerCase().includes(options.address.toLowerCase())),
        );
      }

      // Filter by amount range
      if (options.min !== undefined || options.max !== undefined) {
        history = history.filter((tx) => {
          const amount = mneeInstance.fromAtomicAmount(tx.amount || 0);
          if (options.min !== undefined && amount < options.min) return false;
          if (options.max !== undefined && amount > options.max) return false;
          return true;
        });
      }

      // Apply limit if specified
      if (options.limit && options.limit > 0) {
        history = history.slice(0, options.limit);
      }

      spinner.stop();

      // Display formatted history
      if (history.length === 0) {
        showBox(`${icons.info} No transactions found`, 'Transaction History', 'info');
      } else {
        // Sort transactions by score (newest first)
        history.sort((a, b) => (b.score || 0) - (a.score || 0));

        console.log('');
        console.log(colors.highlight(`${icons.time} Transaction History`));
        console.log(colors.muted('─'.repeat(60)));
        console.log('');

        // Display transactions
        history.forEach((tx, index) => {
          // Transaction type and styling
          const type = tx.type || 'unknown';
          const icon = type === 'send' ? icons.send : type === 'receive' ? icons.receive : icons.dot;
          const color = type === 'send' ? colors.error : type === 'receive' ? colors.success : colors.muted;

          // Convert amount and fee from atomic units
          const amount = mneeInstance.fromAtomicAmount(tx.amount || 0);
          const fee = mneeInstance.fromAtomicAmount(tx.fee || 0);

          // Status indicator
          const statusIcon = tx.status === 'confirmed' ? colors.success('✓') : colors.warning('⏳');
          const statusText = tx.status === 'confirmed' ? colors.muted('confirmed') : colors.warning('unconfirmed');

          // Block height
          const heightDisplay = tx.height ? `block ${tx.height}` : '';

          // Format the main transaction line
          console.log(
            `  ${icon} ${color(type.toUpperCase().padEnd(8))} ${formatAmount(amount).padEnd(
              22,
            )} ${statusIcon} ${statusText}`,
          );

          // Show fee if it exists
          if (fee > 0) {
            console.log(`     ${colors.muted('fee:')} ${formatAmount(fee)}`);
          }

          // Show all counterparties
          if (tx.counterparties && tx.counterparties.length > 0) {
            tx.counterparties.forEach((cp) => {
              const cpAmount = mneeInstance.fromAtomicAmount(cp.amount || 0);
              console.log(
                `     ${colors.muted(type === 'send' ? 'to:' : 'from:')} ${colors.muted(cp.address)} ${formatAmount(
                  cpAmount,
                )}`,
              );
            });
          }

          // Show block height
          if (heightDisplay) {
            console.log(`     ${colors.muted(heightDisplay)}`);
          }

          // Show transaction ID
          console.log(`     ${colors.muted(`tx: ${tx.txid}`)}`);

          // Add separator between transactions (except for the last one)
          if (index < history.length - 1) {
            console.log(colors.muted('     ' + '·'.repeat(50)));
          }
          console.log('');
        });

        console.log(colors.muted('─'.repeat(60)));
        console.log(colors.muted(`  Total: ${history.length} transaction${history.length !== 1 ? 's' : ''}`));
        console.log('');
      }
    } catch (error) {
      spinner.fail(colors.error('Error fetching history'));
      console.error(error);
    }
  });

program
  .command('transfer [amount] [address]')
  .description('Transfer MNEE to another address')
  .action(async (amount?: string, address?: string) => {
    try {
      const activeWallet = await getActiveWallet();

      if (!activeWallet) {
        console.error(
          `${icons.error} ${colors.error('No active wallet found.')} Run ${colors.primary(
            'mnee create',
          )} first or ${colors.primary('mnee use <wallet-name>')} to select a wallet.`,
        );
        return;
      }

      // Validate amount if provided as argument
      if (amount) {
        const validateAmount = (input: string) => {
          const trimmed = input.trim();
          if (!trimmed) return 'Amount is required';

          const validNumberRegex = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
          if (!validNumberRegex.test(trimmed)) {
            return 'Invalid amount. Please enter a valid number (e.g., 10, 10.5, 1.5e-3)';
          }

          const num = parseFloat(trimmed);
          if (isNaN(num)) return 'Invalid amount. Please enter a valid number';
          if (num <= 0) return 'Amount must be greater than 0';
          if (num < 0.00001) return 'Amount must be at least 0.00001 MNEE';

          return true;
        };

        const validation = validateAmount(amount);
        if (validation !== true) {
          console.error(`${icons.error} ${colors.error(validation)}`);
          return;
        }
      }

      // Validate address if provided as argument
      if (address) {
        const validation = validateBSVAddress(address);
        if (validation !== true) {
          console.error(`${icons.error} ${colors.error(validation)}`);
          return;
        }
      }

      // Prompt for amount and/or address if not provided
      let transferAmount = amount;
      let toAddress = address;

      if (!amount || !address) {
        const prompts = [];

        if (!amount) {
          prompts.push({
            type: 'input',
            name: 'amount',
            message: 'Enter the amount to transfer:',
            validate: (input: string) => {
              const trimmed = input.trim();
              if (!trimmed) return 'Amount is required';

              const validNumberRegex = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
              if (!validNumberRegex.test(trimmed)) {
                return 'Invalid amount. Please enter a valid number (e.g., 10, 10.5, 1.5e-3)';
              }

              const num = parseFloat(trimmed);
              if (isNaN(num)) return 'Invalid amount. Please enter a valid number';
              if (num <= 0) return 'Amount must be greater than 0';
              if (num < 0.00001) return 'Amount must be at least 0.00001 MNEE';

              return true;
            },
          });
        }

        if (!address) {
          prompts.push({
            type: 'input',
            name: 'toAddress',
            message: "Enter the recipient's address:",
            validate: validateBSVAddress,
          });
        }

        const answers = await safePrompt(prompts);
        transferAmount = amount || answers.amount;
        toAddress = address || answers.toAddress;
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

      const privateKeyHex = decryptPrivateKey(encryptedKey, password);
      if (!privateKeyHex) {
        console.error('❌ Incorrect password! Decryption failed.');
        return;
      }

      const privateKey = PrivateKey.fromString(privateKeyHex);
      const request = [{ address: toAddress!, amount: parseFloat(transferAmount!) }] as SendMNEE[];

      const spinner = createSpinner(`${icons.send} Initiating transfer from ${colors.primary(activeWallet.name)}...`);
      spinner.start();

      try {
        const mneeInstance = getMneeInstance(activeWallet.environment);
        // Explicitly set broadcast to true to ensure we get a ticketId
        const response = await mneeInstance.transfer(request, privateKey.toWif());

        // Check what type of response we got
        if (response.ticketId) {
          // We got a ticket ID, poll for status
          spinner.stop();

          // Show initial success message
          console.log(
            `${colors.success('✓')} ${colors.primary('Transfer initiated!')} ${colors.muted(
              `Ticket: ${response.ticketId}`,
            )}`,
          );

          // Start looping transaction animation
          const txAnim = startTransactionAnimation();

          // Poll for transaction status
          const finalStatus = await pollForTxStatus(mneeInstance, response.ticketId);

          if (finalStatus.status === 'SUCCESS' || finalStatus.status === 'MINED') {
            // Stop animation with success
            txAnim.stop(true);

            setTimeout(() => {
              showBox(
                `${icons.check} ${colors.highlight('Transaction Details')}\n\n` +
                  `${icons.dot} Amount: ${formatAmount(transferAmount!)}\n` +
                  `${icons.dot} To: ${colors.muted(formatAddress(toAddress!))}\n` +
                  `${icons.dot} TX ID: ${colors.muted(finalStatus.tx_id)}\n\n` +
                  `View on WhatsOnChain:\n` +
                  formatLink(`https://whatsonchain.com/tx/${finalStatus.tx_id}?tab=m8eqcrbs`),
                'Transfer Success',
                'success',
              );
            }, 1200);
          } else if (finalStatus.status === 'FAILED') {
            // Stop animation without success
            txAnim.stop(false);
            showBox(
              `${icons.error} ${colors.error('Transaction failed')}\n\n` + `${finalStatus.errors || 'Unknown error'}`,
              'Transfer Failed',
              'error',
            );
          }
        } else if (response.rawtx) {
          // We got a raw transaction instead (shouldn't happen with broadcast: true)
          spinner.succeed('Transaction created.');
          showBox(
            `${icons.warning} ${colors.warning('Raw transaction returned')}\n\n` +
              `This might indicate the transaction needs to be submitted manually.\n\n` +
              `${colors.muted('Raw TX:')} ${response.rawtx.substring(0, 50)}...`,
            'Warning',
            'warning',
          );
        } else {
          // No valid response
          spinner.fail('Transfer failed. No ticket ID or transaction returned.');
        }
      } catch (error: any) {
        console.log(error);
        spinner.fail(
          `Transfer failed. ${
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
      console.log(`\n${icons.error} ${colors.error('Operation interrupted.')}`);
      process.exit(1);
    }
  });

program
  .command('status <ticketId>')
  .description('Check the status of a transaction using its ticket ID')
  .action(async (ticketId) => {
    try {
      const activeWallet = await getActiveWallet();

      if (!activeWallet) {
        console.error(
          `${icons.error} ${colors.error('No active wallet found.')} Run ${colors.primary(
            'mnee create',
          )} first or ${colors.primary('mnee use <wallet-name>')} to select a wallet.`,
        );
        return;
      }

      const spinner = createSpinner(`Checking status for ticket: ${colors.primary(ticketId)}...`);
      spinner.start();

      try {
        const mneeInstance = getMneeInstance(activeWallet.environment);
        const status = await getTxStatus(mneeInstance, ticketId);

        spinner.stop();

        const statusColor =
          {
            BROADCASTING: colors.warning,
            SUCCESS: colors.success,
            MINED: colors.success,
            FAILED: colors.error,
          }[status.status] || colors.info;

        const statusIcon =
          {
            BROADCASTING: icons.time,
            SUCCESS: icons.success,
            MINED: '⛏️',
            FAILED: icons.error,
          }[status.status] || icons.info;

        let content =
          `${statusIcon} ${colors.highlight('Transaction Status')}\n\n` +
          `${icons.dot} Ticket ID: ${colors.muted(status.id)}\n` +
          `${icons.dot} Status: ${statusColor(status.status)}\n`;

        if (status.tx_id) {
          content += `${icons.dot} TX ID: ${colors.muted(status.tx_id)}\n\n`;
          content += `View on WhatsOnChain:\n${formatLink(
            `https://whatsonchain.com/tx/${status.tx_id}?tab=m8eqcrbs`,
          )}\n`;
        }

        content += `\n${icons.dot} Created: ${colors.muted(new Date(status.createdAt).toLocaleString())}\n`;
        content += `${icons.dot} Updated: ${colors.muted(new Date(status.updatedAt).toLocaleString())}`;

        if (status.errors) {
          content += `\n\n${icons.warning} ${colors.error('Errors:')} ${status.errors}`;
        }

        const boxType = status.status === 'FAILED' ? 'error' : status.status === 'BROADCASTING' ? 'warning' : 'success';
        showBox(content, 'Transaction Status', boxType);
      } catch (error: any) {
        spinner.fail(`Error checking status: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`\n${icons.error} ${colors.error('Error:')}`, error);
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
          `${icons.error} ${colors.error('No active wallet found.')} Run ${colors.primary(
            'mnee create',
          )} first or ${colors.primary('mnee use <wallet-name>')} to select a wallet.`,
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

      showBox(
        `${icons.key} ${colors.highlight('Private Key Export')}\n\n` +
          `${icons.wallet} Wallet: ${colors.primary(activeWallet.name)}\n` +
          `${icons.dot} Environment: ${
            activeWallet.environment === 'production'
              ? colors.success(activeWallet.environment)
              : colors.warning(activeWallet.environment)
          }\n` +
          `${icons.dot} Address: ${colors.muted(activeWallet.address)}\n\n` +
          `${icons.lock} ${colors.warning('WIF Private Key:')}\n` +
          `${colors.muted(wif)}\n\n` +
          `${icons.warning} ${colors.error(' KEEP THIS KEY SAFE!')}\n` +
          `${colors.error('Never share it with anyone!')}`,
        'Private Key',
        'warning',
      );
    } catch (error) {
      console.error(`\n${icons.error} ${colors.error('Error exporting private key:')}`, error);
    }
  });

program
  .command('delete <walletName>')
  .description('Delete a wallet')
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

      animateSuccess(`Wallet "${walletName}" deleted successfully!`);
    } catch (error) {
      console.error(`\n${icons.error} ${colors.error('Error deleting wallet:')}`, error);
    }
  });

program
  .command('list')
  .description('List and switch between your wallets')
  .action(async () => {
    try {
      const wallets = await getAllWallets();

      if (wallets.length === 0) {
        console.log('\n❌ No wallets found. Run `mnee create` to create a wallet.');
        return;
      }

      // Sort wallets: production first, then sandbox
      const sortedWallets = [...wallets].sort((a, b) => {
        if (a.environment === 'production' && b.environment === 'sandbox') return -1;
        if (a.environment === 'sandbox' && b.environment === 'production') return 1;
        return 0;
      });

      // Go straight to wallet selection
      const choices: any[] = [];
      let lastEnv: string | null = null;

      // Find the longest wallet name for proper padding
      const maxNameLength = Math.max(...sortedWallets.map((w) => w.name.length));

      sortedWallets.forEach((wallet) => {
        // Add separator when switching from production to sandbox
        if (lastEnv === 'production' && wallet.environment === 'sandbox') {
          choices.push(new inquirer.Separator(colors.muted('\n──── Sandbox Wallets ────')));
        } else if (lastEnv === null && wallet.environment === 'production') {
          choices.push(new inquirer.Separator(colors.muted('──── Production Wallets ────')));
        } else if (lastEnv === null && wallet.environment === 'sandbox') {
          choices.push(new inquirer.Separator(colors.muted('──── Sandbox Wallets ────')));
        }

        const envIcon = '●';
        const envColor = wallet.environment === 'production' ? colors.success : colors.warning;
        const envLabel = wallet.environment === 'production' ? colors.success('[PROD]') : colors.warning('[TEST]');
        const activeLabel = wallet.isActive ? colors.cyan(' ← current') : '';
        const paddedName = wallet.name + ' '.repeat(Math.max(0, maxNameLength - wallet.name.length));

        choices.push({
          name: `  ${envColor(envIcon)}  ${paddedName}  ${envLabel}  ${colors.muted(wallet.address)}${activeLabel}`,
          value: wallet.name,
          short: wallet.name,
        });

        lastEnv = wallet.environment;
      });

      // Find the active wallet's name to set as default
      const activeWalletName = sortedWallets.find((w) => w.isActive)?.name;

      const { selectedWallet } = await safePrompt([
        {
          type: 'list',
          name: 'selectedWallet',
          message: 'Select a wallet:',
          choices,
          pageSize: 50,
          default: activeWalletName,
        },
      ]);

      const wallet = wallets.find((w) => w.name === selectedWallet);
      if (wallet) {
        // Only update if switching to a different wallet
        if (!wallet.isActive) {
          wallets.forEach((w) => {
            w.isActive = w.name === selectedWallet;
          });

          await saveWallets(wallets);
          await setActiveWallet(wallet);

          animateSuccess(`Switched to wallet: ${wallet.name}`);
          setTimeout(() => {
            console.log(
              `${icons.dot} Environment: ${
                wallet.environment === 'production'
                  ? colors.success(wallet.environment)
                  : colors.warning(wallet.environment)
              }`,
            );
            console.log(`${icons.dot} Address: ${colors.muted(wallet.address)}`);
          }, 1200);
        } else {
          console.log(`\n${icons.info} Already using wallet: ${colors.primary(wallet.name)}`);
        }
      }
    } catch (error) {
      console.error(`\n${icons.error} ${colors.error('Error listing wallets:')}`, error);
    }
  });

program
  .command('use <walletName>')
  .description('Switch to a different wallet')
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

      animateSuccess(`Switched to wallet: ${wallet.name}`);
      setTimeout(() => {
        console.log(
          `${icons.dot} Environment: ${
            wallet.environment === 'production'
              ? colors.success(wallet.environment)
              : colors.warning(wallet.environment)
          }`,
        );
        console.log(`${icons.dot} Address: ${colors.muted(wallet.address)}`);
      }, 1200);
    } catch (error) {
      console.error(`\n${icons.error} ${colors.error('Error switching wallet:')}`, error);
    }
  });

program
  .command('rename <oldName> <newName>')
  .description('Rename a wallet')
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

      animateSuccess(`Wallet renamed from "${oldName}" to "${newName}"`);

      if (wallet.isActive) {
        setTimeout(() => {
          console.log(`${icons.star} ${colors.info('This is your active wallet.')}`);
        }, 1200);
      }
    } catch (error) {
      console.error(`\n${icons.error} ${colors.error('Error renaming wallet:')}`, error);
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

      animateSuccess('Wallet imported successfully!');

      setTimeout(() => {
        showBox(
          `${icons.wallet} ${colors.highlight('Imported Wallet')}\n\n` +
            `${icons.dot} Name: ${colors.primary(walletName)}\n` +
            `${icons.dot} Environment: ${
              environment === 'production' ? colors.success(environment) : colors.warning(environment)
            }\n` +
            `${icons.dot} Address: ${colors.muted(address)}\n\n` +
            `${icons.check} ${colors.success('This wallet is now active')}`,
          'Import Success',
          'success',
        );
      }, 1200);
    } catch (error) {
      console.error(`\n${icons.error} ${colors.error('Error importing wallet:')}`, error);
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

      animateSuccess(`Successfully authenticated as ${result.user.email}`);

      setTimeout(() => {
        showBox(
          `${icons.unlock} ${colors.highlight('Authentication Complete')}\n\n` +
            `${icons.dot} Logged in as: ${colors.primary(result.user.email)}\n\n` +
            `${colors.info('Available commands:')}\n` +
            `  ${colors.primary('mnee faucet')} - Request sandbox tokens\n` +
            `  ${colors.primary('mnee whoami')} - Show current user\n` +
            `  ${colors.primary('mnee logout')} - Sign out`,
          'Welcome',
          'success',
        );
      }, 1200);
    } catch (error: any) {
      console.error(`\n${icons.error} ${colors.error('Authentication failed:')}`, error.message);
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

      animateSuccess('Successfully logged out.');
    } catch (error: any) {
      console.error(`${icons.error} ${colors.error('Error during logout:')}`, error.message);
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

        showBox(
          `${icons.dot} Email: ${colors.primary(profile.email)}\n` +
            `${icons.dot} Name: ${colors.info(profile.name || 'Not set')}` +
            (profile.company ? `\n${icons.dot} Company: ${colors.info(profile.company)}` : ''),
          'Current User',
          'info',
        );
      } catch (error) {
        console.error('❌ Failed to get user profile. Your session may have expired.');
        console.log('Run `mnee login` to authenticate again.');
      }
    } catch (error: any) {
      console.error(`${icons.error} ${colors.error('Error:')}`, error.message);
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
          `${icons.error} ${colors.error('No active wallet found.')} Run ${colors.primary(
            'mnee create',
          )} first or ${colors.primary('mnee use <wallet-name>')} to select a wallet.`,
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

      // Start looping airdrop animation
      const airdropAnim = startAirdropAnimation();

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
        airdropAnim.stop(true); // Stop with completion message

        showBox(
          `${icons.money} ${colors.highlight('Tokens Received!')}\n\n` +
            `${icons.dot} Amount: ${formatAmount(result.amount || 10)}\n` +
            `${icons.dot} To: ${colors.muted(formatAddress(depositAddress))}\n` +
            `${icons.dot} TX ID: ${colors.muted(result.txid)}\n\n` +
            `View on WhatsOnChain:\n` +
            formatLink(`https://whatsonchain.com/tx/${result.txid}?tab=m8eqcrbs`),
          'Faucet Success',
          'success',
        );
      } else {
        airdropAnim.stop(false); // Stop without completion
        console.error(`${icons.error} ${colors.error(result.message || 'Failed to request tokens')}`);
      }
    } catch (error: any) {
      console.error(`\n${icons.error} ${colors.error('Faucet request failed:')}`, error.message);
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

const validateBSVAddress = (address: string): boolean | string => {
  if (!address || address.trim() === '') {
    return 'Address cannot be empty';
  }

  const trimmedAddress = address.trim();

  // BSV mainnet addresses start with '1' (P2PKH)
  if (!trimmedAddress.startsWith('1')) {
    return 'Invalid BSV address. Address must start with "1" for mainnet';
  }

  try {
    // Use @bsv/sdk's fromBase58Check to validate the address format and checksum
    Utils.fromBase58Check(trimmedAddress);
    return true;
  } catch (error) {
    return 'Invalid BSV address format. Please check the address and try again';
  }
};

await migrateOldWallets();

program.parse(process.argv);

process.on('SIGINT', () => {
  console.log(`\n${icons.dot} ${colors.muted('Exiting gracefully...')}`);
  process.exit(0);
});
