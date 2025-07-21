#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import crypto from 'crypto';
import { PrivateKey } from '@bsv/sdk';
import { decryptPrivateKey, encryptPrivateKey } from './utils/crypto.js';
import { getActiveWallet, getAllWallets, saveWallets, setActiveWallet, getWalletByAddress, setPrivateKey, deletePrivateKey, getPrivateKey, clearActiveWallet, getLegacyWallet, deleteLegacyWallet, } from './utils/keytar.js';
import { getVersion, singleLineLogger } from './utils/helper.js';
import Mnee from 'mnee';
import { readTxHistoryCache, writeTxHistoryCache, clearTxHistoryCache } from './utils/cache.js';
const getMneeInstance = (environment, apiKey) => {
    return new Mnee({ environment, apiKey });
};
const safePrompt = async (questions) => {
    try {
        return await inquirer.prompt(questions);
    }
    catch {
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
                validate: (input) => {
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
                validate: (input) => {
                    if (input.length < 8) {
                        return 'Password must be at least 8 characters long';
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
        const newWallet = {
            address,
            environment,
            name: walletName,
            isActive: wallets.length === 0,
        };
        wallets.push(newWallet);
        await saveWallets(wallets);
        await setPrivateKey(address, encryptedKey);
        if (newWallet.isActive) {
            await setActiveWallet(newWallet);
        }
        console.log('\n✅ Wallet created successfully!');
        console.log(`\nName: ${walletName}`);
        console.log(`Environment: ${environment}`);
        console.log(`Address: ${address}\n`);
        if (newWallet.isActive) {
            console.log('This wallet is now your active wallet.');
        }
        else {
            console.log(`To use this wallet, run: mnee use ${walletName}`);
        }
    }
    catch (error) {
        console.error('\n❌ Error creating wallet:', error);
    }
});
program
    .command('address')
    .description('Retrieve your wallet address')
    .action(async () => {
    const activeWallet = await getActiveWallet();
    if (!activeWallet) {
        console.error('❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.');
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
        console.error('❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.');
        return;
    }
    singleLineLogger.start(`Fetching balance for ${activeWallet.name} (${activeWallet.environment})...`);
    try {
        const mneeInstance = getMneeInstance(activeWallet.environment);
        const { decimalAmount } = await mneeInstance.balance(activeWallet.address);
        singleLineLogger.done(`\n$${decimalAmount} MNEE\n`);
    }
    catch {
        singleLineLogger.done('');
    }
});
program
    .command('history')
    .description('Get the history of the wallet')
    .option('-u, --unconfirmed', 'Show unconfirmed transactions')
    .option('-f, --fresh', 'Clear cache and fetch fresh history from the beginning')
    // TODO: Future enhancement - Add filtering options:
    // - Filter by transaction type (send/receive)
    // - Filter by status (confirmed/unconfirmed)
    // - Filter by transaction ID
    // - Filter by counterparty address
    // - Filter by amount range
    .action(async (options) => {
    const activeWallet = await getActiveWallet();
    if (!activeWallet) {
        console.error('❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.');
        return;
    }
    singleLineLogger.start(`Fetching history for ${activeWallet.name} (${activeWallet.environment})...`);
    try {
        const mneeInstance = getMneeInstance(activeWallet.environment);
        let nextScore = undefined;
        let hasMore = true;
        let history = [];
        let attempts = 0;
        const maxAttempts = 20; // Safety limit to prevent infinite loops
        if (options.fresh) {
            console.log('Fresh mode: Clearing cache and fetching from the beginning...');
            clearTxHistoryCache(activeWallet);
        }
        else {
            const cachedData = readTxHistoryCache(activeWallet);
            if (cachedData) {
                history = cachedData.history;
                nextScore = cachedData.nextScore;
                // If nextScore is 0, we have all history
                if (nextScore === 0) {
                    if (options.unconfirmed) {
                        const unconfirmedHistory = history.filter((tx) => tx.status === 'unconfirmed');
                        console.log(JSON.stringify(unconfirmedHistory, null, 2));
                        singleLineLogger.done(`\n${unconfirmedHistory.length} unconfirmed transaction${unconfirmedHistory.length !== 1 ? 's' : ''} fetched successfully from cache!\n`);
                    }
                    else {
                        console.log(JSON.stringify(history, null, 2));
                        singleLineLogger.done(`\n${history.length} transactions fetched successfully from cache!\n`);
                    }
                    return;
                }
            }
        }
        while (hasMore && attempts < maxAttempts) {
            const { history: newHistory, nextScore: newNextScore } = await mneeInstance.recentTxHistory(activeWallet.address, nextScore, 100);
            if (newNextScore === nextScore && newNextScore !== undefined)
                break;
            history.push(...newHistory);
            nextScore = newNextScore;
            hasMore = nextScore !== 0 && nextScore !== undefined;
            attempts++;
        }
        if (attempts >= maxAttempts) {
            console.log('Reached maximum number of attempts. Some history may be missing.');
        }
        writeTxHistoryCache(activeWallet, history, nextScore || 0);
        if (options.unconfirmed) {
            const unconfirmedHistory = history.filter((tx) => tx.status === 'unconfirmed');
            console.log(JSON.stringify(unconfirmedHistory, null, 2));
            singleLineLogger.done(`\n${unconfirmedHistory.length} unconfirmed transaction${unconfirmedHistory.length !== 1 ? 's' : ''} fetched successfully!\n`);
        }
        else {
            console.log(JSON.stringify(history, null, 2));
            singleLineLogger.done(`\n${history.length} transactions fetched successfully!\n`);
        }
    }
    catch {
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
            console.error('❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.');
            return;
        }
        const { amount, toAddress } = await safePrompt([
            {
                type: 'input',
                name: 'amount',
                message: 'Enter the amount to transfer:',
                validate: (input) => {
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
        const request = [{ address: toAddress, amount: parseFloat(amount) }];
        singleLineLogger.start(`Transferring MNEE from ${activeWallet.name} (${activeWallet.environment})...`);
        try {
            const mneeInstance = getMneeInstance(activeWallet.environment);
            const { txid, error } = await mneeInstance.transfer(request, privateKey.toWif());
            if (!txid) {
                singleLineLogger.done(`❌ Transfer failed. ${error
                    ? error.includes('status: 423')
                        ? 'The sending or receiving address may be frozen or blacklisted. Please visit https://mnee.io and contact support for questions or concerns.'
                        : 'Please try again.'
                    : 'Please try again.'}`);
                return;
            }
            singleLineLogger.done(`\n✅ Transfer successful! TXID:\n${txid}\n`);
        }
        catch {
            singleLineLogger.done('');
        }
    }
    catch (error) {
        console.log('\n❌ Operation interrupted.');
        process.exit(1);
    }
});
program
    .command('export')
    .description('Decrypt and retrieve your private key in WIF format')
    .action(async () => {
    try {
        const activeWallet = await getActiveWallet();
        if (!activeWallet) {
            console.error('❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.');
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
    }
    catch (error) {
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
        let decryptedKey = null;
        try {
            decryptedKey = decryptPrivateKey(encryptedKey, password);
        }
        catch (error) {
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
            }
            else {
                await clearActiveWallet();
                console.log('\nℹ️ No active wallet set. Create a new wallet with `mnee create`.');
            }
        }
        // Delete the wallet's private key first
        await deletePrivateKey(wallet.address);
        // Then update the wallets list
        await saveWallets(updatedWallets);
        console.log(`\n🗑️ Wallet "${walletName}" deleted successfully!`);
    }
    catch (error) {
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
            const truncatedAddress = `${wallet.address.slice(0, 8)}...${wallet.address.slice(-8)}`;
            console.log(`${index + 1}. ${wallet.name}${activeIndicator}`);
            console.log(`   Environment: ${wallet.environment}`);
            console.log(`   Address: ${truncatedAddress}`);
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
                        name: `${wallet.name} | ${wallet.environment} | ${wallet.address.slice(0, 5)}...${wallet.address.slice(-4)}`,
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
        let privateKey;
        try {
            privateKey = PrivateKey.fromWif(wifKey);
        }
        catch (error) {
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
                validate: (input) => {
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
                validate: (input) => {
                    if (input.length < 8) {
                        return 'Password must be at least 8 characters long';
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
        const newWallet = {
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
    }
    catch (error) {
        console.error('\n❌ Error importing wallet:', error);
    }
});
const migrateOldWallets = async () => {
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
        const newWallet = {
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
        }
        else {
            console.log(`To use it, run: mnee use ${name}`);
        }
    }
    catch (error) {
        console.error('\n❌ Error during wallet migration:', error);
    }
};
const validateWalletName = (name) => {
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
