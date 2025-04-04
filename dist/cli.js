#!/usr/bin/env node
/**
 * MNEE CLI - Command Line Interface for interacting with MNEE tokens
 *
 * This implementation uses the Mnee package with the new configuration:
 * new Mnee({ environment: string, apiKey?: string })
 *
 * This allows for creating and managing both production and sandbox wallets.
 */
import { Command } from "commander";
import inquirer from "inquirer";
import keytar from "keytar";
import crypto from "crypto";
import { PrivateKey } from "@bsv/sdk";
import { decryptPrivateKey, encryptPrivateKey } from "./utils/crypto.js";
import { singleLineLogger } from "./utils/helper.js";
import Mnee from "mnee";
const SERVICE_NAME = "mnee-cli";
const WALLETS_KEY = "wallets";
const ACTIVE_WALLET_KEY = "activeWallet";
// Helper function to get all wallets
const getAllWallets = async () => {
    const walletsJson = await keytar.getPassword(SERVICE_NAME, WALLETS_KEY);
    return walletsJson ? JSON.parse(walletsJson) : [];
};
// Helper function to save all wallets
const saveWallets = async (wallets) => {
    await keytar.setPassword(SERVICE_NAME, WALLETS_KEY, JSON.stringify(wallets));
};
// Helper function to get active wallet
const getActiveWallet = async () => {
    const activeWalletJson = await keytar.getPassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
    return activeWalletJson ? JSON.parse(activeWalletJson) : null;
};
// Helper function to set active wallet
const setActiveWallet = async (wallet) => {
    await keytar.setPassword(SERVICE_NAME, ACTIVE_WALLET_KEY, JSON.stringify(wallet));
};
// Helper function to get Mnee instance with environment
const getMneeInstance = (environment, apiKey) => {
    // Using the new Mnee constructor with environment and apiKey
    return new Mnee({ environment, apiKey });
};
const safePrompt = async (questions) => {
    try {
        return await inquirer.prompt(questions);
    }
    catch {
        console.log("\n❌ Operation cancelled by user.");
        process.exit(1);
    }
};
const program = new Command();
program
    .name("mnee")
    .description("CLI for interacting with MNEE tokens")
    .version("1.0.0");
program
    .command("create")
    .description("Generate a new wallet and store keys securely")
    .action(async () => {
    try {
        // Get existing wallets to check for duplicate names
        const existingWallets = await getAllWallets();
        // Ask for environment type
        const { environment } = await safePrompt([
            {
                type: "list",
                name: "environment",
                message: "Select wallet environment:",
                choices: [
                    { name: "Production", value: "production" },
                    { name: "Sandbox", value: "sandbox" }
                ],
                default: "production"
            }
        ]);
        const { walletName } = await safePrompt([
            {
                type: "input",
                name: "walletName",
                message: `Enter a name for your ${environment} wallet:`,
                default: `${environment}-wallet-${Date.now()}`,
                validate: (input) => {
                    // First validate the format
                    const validation = validateWalletName(input);
                    if (!validation.isValid) {
                        return validation.error || "Invalid wallet name";
                    }
                    // Then check for duplicates
                    if (existingWallets.some(w => w.name === input)) {
                        return `A wallet with name "${input}" already exists`;
                    }
                    return true;
                }
            },
        ]);
        const entropy = crypto.randomBytes(32);
        const privateKey = PrivateKey.fromString(entropy.toString("hex"));
        const address = privateKey.toAddress();
        const { password, confirmPassword } = await safePrompt([
            {
                type: "password",
                name: "password",
                message: "Set a password for your wallet:",
                mask: "*",
            },
            {
                type: "password",
                name: "confirmPassword",
                message: "Confirm your password:",
                mask: "*",
            },
        ]);
        if (password !== confirmPassword) {
            console.error("❌ Passwords do not match. Try again.");
            return;
        }
        const encryptedKey = encryptPrivateKey(privateKey.toString(), password);
        // Get existing wallets
        const wallets = await getAllWallets();
        // Create new wallet info
        const newWallet = {
            address,
            environment,
            name: walletName,
            isActive: wallets.length === 0, // Make active if first wallet
        };
        // Add new wallet to list
        wallets.push(newWallet);
        // Save wallets list
        await saveWallets(wallets);
        // Save encrypted private key
        await keytar.setPassword(SERVICE_NAME, `privateKey_${address}`, encryptedKey);
        // Set as active wallet if it's the first one
        if (newWallet.isActive) {
            await setActiveWallet(newWallet);
        }
        console.log("\n✅ Wallet created successfully!");
        console.log(`\nName: ${walletName}`);
        console.log(`Environment: ${environment}`);
        console.log(`Address: ${address}\n`);
        if (newWallet.isActive) {
            console.log("This wallet is now your active wallet.");
        }
        else {
            console.log(`To use this wallet, run: mnee use ${walletName}`);
        }
    }
    catch (error) {
        console.error("\n❌ Error creating wallet:", error);
    }
});
program
    .command("address")
    .description("Retrieve your wallet address")
    .action(async () => {
    const activeWallet = await getActiveWallet();
    if (!activeWallet) {
        console.error("❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.");
        return;
    }
    console.log(`\nActive Wallet: ${activeWallet.name} (${activeWallet.environment})`);
    console.log(`Address: ${activeWallet.address}\n`);
});
program
    .command("balance")
    .description("Get the balance of the wallet")
    .action(async () => {
    const activeWallet = await getActiveWallet();
    if (!activeWallet) {
        console.error("❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.");
        return;
    }
    singleLineLogger.start(`Fetching balance for ${activeWallet.name} (${activeWallet.environment})...`);
    const mneeInstance = getMneeInstance(activeWallet.environment);
    const { decimalAmount } = await mneeInstance.balance(activeWallet.address);
    singleLineLogger.done(`\n$${decimalAmount} MNEE\n`);
});
program
    .command("transfer")
    .description("Transfer MNEE to another address")
    .action(async () => {
    try {
        const activeWallet = await getActiveWallet();
        if (!activeWallet) {
            console.error("❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.");
            return;
        }
        const { amount, toAddress } = await safePrompt([
            {
                type: "input",
                name: "amount",
                message: "Enter the amount to transfer:",
            },
            {
                type: "input",
                name: "toAddress",
                message: "Enter the recipient's address:",
            },
        ]);
        const { password } = await safePrompt([
            {
                type: "password",
                name: "password",
                message: "Enter your wallet password:",
                mask: "*",
            },
        ]);
        const encryptedKey = await keytar.getPassword(SERVICE_NAME, `privateKey_${activeWallet.address}`);
        if (!encryptedKey) {
            console.error("❌ Private key not found for this wallet.");
            return;
        }
        const privateKeyHex = decryptPrivateKey(encryptedKey, password);
        if (!privateKeyHex) {
            console.error("❌ Incorrect password! Decryption failed.");
            return;
        }
        const privateKey = PrivateKey.fromString(privateKeyHex);
        const request = [
            { address: toAddress, amount: parseFloat(amount) },
        ];
        singleLineLogger.start(`Transferring MNEE from ${activeWallet.name} (${activeWallet.environment})...`);
        const mneeInstance = getMneeInstance(activeWallet.environment);
        const { txid, error } = await mneeInstance.transfer(request, privateKey.toWif());
        if (!txid) {
            singleLineLogger.done(`❌ Transfer failed. ${error ? error : "Please try again."}`);
            return;
        }
        singleLineLogger.done(`\n✅ Transfer successful! TXID:\n${txid}\n`);
    }
    catch (error) {
        console.log("\n❌ Operation interrupted.");
        process.exit(1);
    }
});
program
    .command("export")
    .description("Decrypt and retrieve your private key in WIF format")
    .action(async () => {
    try {
        const activeWallet = await getActiveWallet();
        if (!activeWallet) {
            console.error("❌ No active wallet found. Run `mnee create` first or `mnee use <wallet-name>` to select a wallet.");
            return;
        }
        const { password } = await safePrompt([
            {
                type: "password",
                name: "password",
                message: "Enter your wallet password:",
                mask: "*",
            },
        ]);
        const encryptedKey = await keytar.getPassword(SERVICE_NAME, `privateKey_${activeWallet.address}`);
        if (!encryptedKey) {
            console.error("❌ Private key not found for this wallet.");
            return;
        }
        const { confirm } = await safePrompt([
            {
                type: "confirm",
                name: "confirm",
                message: "You are about to expose your private key. Continue?",
                default: false,
            },
        ]);
        if (!confirm) {
            console.log("🚫 Operation cancelled.");
            return;
        }
        const privateKeyHex = decryptPrivateKey(encryptedKey, password);
        if (!privateKeyHex) {
            console.error("❌ Incorrect password! Decryption failed.");
            return;
        }
        const privateKey = PrivateKey.fromString(privateKeyHex);
        const wif = privateKey.toWif();
        console.log(`\nWallet Name: ${activeWallet.name}`);
        console.log(`Environment: ${activeWallet.environment}`);
        console.log(`Wallet Address:\n${activeWallet.address}`);
        console.log(`\nWIF Private Key:\n${wif}`);
        console.log("\n🚨 Keep this key SAFE! Never share it with anyone.\n");
    }
    catch (error) {
        console.error("\n❌ Error exporting private key:", error);
    }
});
program
    .command("delete")
    .description("Delete a wallet")
    .argument("<walletName>", "Name of the wallet to delete (defaults to active wallet)")
    .action(async (walletName) => {
    try {
        const wallets = await getAllWallets();
        const activeWallet = await getActiveWallet();
        if (wallets.length === 0) {
            console.error("❌ No wallets found.");
            return;
        }
        // If no wallet name provided, use active wallet
        if (!walletName && activeWallet) {
            walletName = activeWallet.name;
        }
        if (!walletName) {
            console.error("❌ No wallet specified and no active wallet found.");
            return;
        }
        const wallet = wallets.find(w => w.name === walletName);
        if (!wallet) {
            console.error(`❌ Wallet "${walletName}" not found.`);
            return;
        }
        const { confirm } = await safePrompt([
            {
                type: "confirm",
                name: "confirm",
                message: `Are you sure you want to delete wallet "${walletName}"?`,
                default: false,
            },
        ]);
        if (!confirm) {
            console.log("🚫 Operation cancelled.");
            return;
        }
        // Get the encrypted private key
        const encryptedKey = await keytar.getPassword(SERVICE_NAME, `privateKey_${wallet.address}`);
        if (!encryptedKey) {
            console.error("❌ Private key not found for this wallet.");
            return;
        }
        // Prompt for password
        const { password } = await safePrompt([
            {
                type: "password",
                name: "password",
                message: "Enter your wallet password to confirm deletion:",
                mask: "*",
            },
        ]);
        // Verify password by attempting to decrypt the private key
        let decryptedKey = null;
        try {
            decryptedKey = decryptPrivateKey(encryptedKey, password);
        }
        catch (error) {
            console.error("❌ Incorrect password! Deletion cancelled.");
            return;
        }
        // Double-check that decryption was successful
        if (!decryptedKey) {
            console.error("❌ Password verification failed. Deletion cancelled.");
            return;
        }
        // Remove wallet from list
        const updatedWallets = wallets.filter(w => w.name !== walletName);
        // If deleting active wallet, set a new active wallet if available
        if (wallet.isActive) {
            if (updatedWallets.length > 0) {
                // Set the first remaining wallet as active
                updatedWallets[0].isActive = true;
                await setActiveWallet(updatedWallets[0]);
                console.log(`\n✅ Active wallet switched to: ${updatedWallets[0].name}`);
            }
            else {
                // No wallets left, clear active wallet
                await keytar.deletePassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
                console.log("\nℹ️ No active wallet set. Create a new wallet with `mnee create`.");
            }
        }
        // Save updated wallets
        await saveWallets(updatedWallets);
        // Delete private key
        await keytar.deletePassword(SERVICE_NAME, `privateKey_${wallet.address}`);
        console.log(`\n🗑️ Wallet "${walletName}" deleted successfully!`);
    }
    catch (error) {
        console.error("\n❌ Error deleting wallet:", error);
    }
});
program
    .command("list")
    .description("List all your wallets")
    .action(async () => {
    try {
        const wallets = await getAllWallets();
        const activeWallet = await getActiveWallet();
        if (wallets.length === 0) {
            console.log("\n❌ No wallets found. Run `mnee create` to create a wallet.");
            return;
        }
        console.log("\nYour Wallets:");
        console.log("-------------");
        wallets.forEach((wallet, index) => {
            const activeIndicator = wallet.isActive ? " (Active) ✅" : "";
            console.log(`${index + 1}. ${wallet.name}${activeIndicator}`);
            console.log(`   Environment: ${wallet.environment}`);
            console.log(`   Address: ${wallet.address}`);
            console.log("");
        });
        if (activeWallet) {
            console.log(`Current active wallet: ${activeWallet.name} (${activeWallet.environment})`);
        }
    }
    catch (error) {
        console.error("\n❌ Error listing wallets:", error);
    }
});
program
    .command("use")
    .description("Switch to a different wallet")
    .argument("<walletName>", "Name of the wallet to use")
    .action(async (walletName) => {
    try {
        const wallets = await getAllWallets();
        const wallet = wallets.find(w => w.name === walletName);
        if (!wallet) {
            console.error(`\n❌ Wallet "${walletName}" not found.`);
            console.log("Run `mnee list` to see your available wallets.");
            return;
        }
        // Update active status for all wallets
        wallets.forEach(w => {
            w.isActive = w.name === walletName;
        });
        // Save updated wallets
        await saveWallets(wallets);
        // Set active wallet
        await setActiveWallet(wallet);
        console.log(`\n✅ Switched to wallet: ${wallet.name}`);
        console.log(`Environment: ${wallet.environment}`);
        console.log(`Address: ${wallet.address}`);
    }
    catch (error) {
        console.error("\n❌ Error switching wallet:", error);
    }
});
program
    .command("rename")
    .description("Rename a wallet")
    .argument("<oldName>", "Current name of the wallet")
    .argument("<newName>", "New name for the wallet")
    .action(async (oldName, newName) => {
    try {
        // Validate the new wallet name
        const validation = validateWalletName(newName);
        if (!validation.isValid) {
            console.error(`❌ ${validation.error}`);
            return;
        }
        const wallets = await getAllWallets();
        if (wallets.length === 0) {
            console.error("❌ No wallets found. Run `mnee create` to create a wallet.");
            return;
        }
        const wallet = wallets.find(w => w.name === oldName);
        if (!wallet) {
            console.error(`❌ Wallet "${oldName}" not found.`);
            console.log("Run `mnee list` to see your available wallets.");
            return;
        }
        // Check if new name already exists
        if (wallets.some(w => w.name === newName)) {
            console.error(`❌ A wallet with name "${newName}" already exists.`);
            return;
        }
        // Update wallet name
        wallet.name = newName;
        // Save updated wallets
        await saveWallets(wallets);
        // Update active wallet if needed
        const activeWallet = await getActiveWallet();
        if (activeWallet && activeWallet.name === oldName) {
            await setActiveWallet(wallet);
        }
        console.log(`\n✅ Wallet renamed from "${oldName}" to "${newName}"`);
        if (wallet.isActive) {
            console.log("This is your active wallet.");
        }
    }
    catch (error) {
        console.error("\n❌ Error renaming wallet:", error);
    }
});
// Helper function to migrate old wallet format to new format
const migrateOldWallets = async () => {
    try {
        // Check if we already have wallets in the new format
        const existingWallets = await getAllWallets();
        if (existingWallets.length > 0) {
            return; // Already migrated
        }
        // Check for old wallet format
        const oldAddress = await keytar.getPassword(SERVICE_NAME, "walletAddress");
        const oldPrivateKey = await keytar.getPassword(SERVICE_NAME, "privateKey");
        if (oldAddress && oldPrivateKey) {
            console.log("\n🔄 Migrating existing wallet to new format...");
            // Create a wallet info object
            const wallet = {
                address: oldAddress,
                environment: 'production', // Default to production for old wallets
                name: 'legacy-wallet',
                isActive: true,
            };
            // Save the wallet
            await saveWallets([wallet]);
            await setActiveWallet(wallet);
            // Rename the private key to match new format
            await keytar.setPassword(SERVICE_NAME, `privateKey_${oldAddress}`, oldPrivateKey);
            // Clean up old keys
            await keytar.deletePassword(SERVICE_NAME, "walletAddress");
            await keytar.deletePassword(SERVICE_NAME, "privateKey");
            console.log("✅ Migration complete!");
            console.log(`Your wallet has been migrated to the new format with name: ${wallet.name}`);
            console.log("You can rename it using: mnee rename legacy-wallet <new-name>");
        }
    }
    catch (error) {
        console.error("\n❌ Error migrating wallet:", error);
    }
};
// Run migration for existing wallets
migrateOldWallets().catch(error => {
    console.error("\n❌ Error during wallet migration:", error);
});
// Helper function to validate wallet name
const validateWalletName = (name) => {
    // Check for empty name
    if (!name || name.trim() === '') {
        return { isValid: false, error: "Wallet name cannot be empty" };
    }
    // Check for spaces
    if (name.includes(' ')) {
        return { isValid: false, error: "Wallet name cannot contain spaces" };
    }
    // Check for special characters (only allow alphanumeric, hyphens, and underscores)
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        return { isValid: false, error: "Wallet name can only contain letters, numbers, hyphens, and underscores" };
    }
    // Check for length (between 1 and 50 characters)
    if (name.length < 1 || name.length > 50) {
        return { isValid: false, error: "Wallet name must be between 1 and 50 characters" };
    }
    return { isValid: true };
};
program.parse(process.argv);
if (!process.argv.slice(2).length) {
    console.log("\nMNEE CLI - Manage your MNEE tokens\n");
    console.log("Commands:");
    console.log("  create                  Create a new wallet");
    console.log("  list                    List all your wallets");
    console.log("  use <walletName>        Switch to a different wallet");
    console.log("  address                 Show your active wallet address");
    console.log("  balance                 Check your wallet balance");
    console.log("  transfer                Transfer MNEE to another address");
    console.log("  export                  Export your private key (WIF format)");
    console.log("  delete <walletName>     Delete a wallet");
    console.log("  rename <oldName> <newName>  Rename a wallet");
    console.log("\nFor more information on a command, run: mnee <command> --help\n");
}
process.on("SIGINT", () => {
    console.log("\n👋 Exiting program gracefully...");
    process.exit(0);
});
