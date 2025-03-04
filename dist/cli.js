#!/usr/bin/env node
import { Command } from "commander";
import inquirer from "inquirer";
import keytar from "keytar";
import crypto from "crypto";
import { PrivateKey } from "@bsv/sdk";
import { decryptPrivateKey, encryptPrivateKey } from "./utils/crytpo.js";
import { MNEEService } from "./Mnee.service.js";
import { singleLineLogger } from "./utils/helper.js";
const mneeService = new MNEEService();
const program = new Command();
const SERVICE_NAME = "mnee-cli";
const safePrompt = async (questions) => {
    try {
        return await inquirer.prompt(questions);
    }
    catch {
        console.log("\n❌ Operation cancelled by user.");
        process.exit(1);
    }
};
// 🚀 CREATE WALLET
program
    .command("create")
    .description("Generate a new wallet and store keys securely")
    .action(async () => {
    try {
        const existingAddress = await keytar.getPassword(SERVICE_NAME, "walletAddress");
        if (existingAddress) {
            console.error("❌ Wallet already exists. Run `mnee export-key` to retrieve keys.");
            return;
        }
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
        await keytar.setPassword(SERVICE_NAME, "privateKey", encryptedKey);
        await keytar.setPassword(SERVICE_NAME, "walletAddress", address);
        console.log("\n✅ Wallet created successfully!");
        console.log(`\n${address}\n`);
    }
    catch (error) {
        console.error("\n❌ Error creating wallet:", error);
    }
});
// 🚀 GET WALLET ADDRESS
program
    .command("address")
    .description("Retrieve your wallet address")
    .action(async () => {
    const address = await keytar.getPassword(SERVICE_NAME, "walletAddress");
    if (!address) {
        console.error("❌ No wallet found. Run `mnee create-wallet` first.");
        return;
    }
    console.log(`\n${address}\n`);
});
// 🚀 GET BALANCE
program
    .command("balance")
    .description("Get the balance of the wallet")
    .action(async () => {
    const address = await keytar.getPassword(SERVICE_NAME, "walletAddress");
    if (!address) {
        console.error("❌ No wallet found. Run `mnee create-wallet` first.");
        return;
    }
    singleLineLogger.start("Fetching balance...");
    const { decimalAmount } = await mneeService.getBalance(address);
    singleLineLogger.done(`\n$${decimalAmount} MNEE\n`);
});
// 🚀 TRANSFER TOKENS
program
    .command("transfer")
    .description("Transfer MNEE to another address")
    .action(async () => {
    try {
        const address = await keytar.getPassword(SERVICE_NAME, "walletAddress");
        if (!address) {
            console.error("❌ No wallet found. Run `mnee create-wallet` first.");
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
        const encryptedKey = await keytar.getPassword(SERVICE_NAME, "privateKey");
        if (!encryptedKey) {
            console.error("❌ No wallet found. Run `mnee create-wallet` first.");
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
        singleLineLogger.start("Transferring MNEE...");
        const { txid, error } = await mneeService.transfer(address, request, privateKey, singleLineLogger);
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
// 🚀 EXPORT PRIVATE KEY
program
    .command("export")
    .description("Decrypt and retrieve your private key in WIF format")
    .action(async () => {
    try {
        const { password } = await safePrompt([
            {
                type: "password",
                name: "password",
                message: "Enter your wallet password:",
                mask: "*",
            },
        ]);
        const encryptedKey = await keytar.getPassword(SERVICE_NAME, "privateKey");
        const address = await keytar.getPassword(SERVICE_NAME, "walletAddress");
        if (!encryptedKey || !address) {
            console.error("❌ No wallet found. Run `mnee create-wallet` first.");
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
        console.log("\nWallet Address:\n", address);
        console.log("\nWIF Private Key:\n", wif);
        console.log("\n🚨 Keep this key SAFE! Never share it with anyone.\n");
    }
    catch (error) {
        console.error("\n❌ Error exporting private key:", error);
    }
});
// 🚀 DELETE WALLET
program
    .command("delete")
    .description("Delete your wallet and all stored keys")
    .action(async () => {
    try {
        const { confirm } = await safePrompt([
            {
                type: "confirm",
                name: "confirm",
                message: "Are you sure you want to delete your wallet?",
                default: false,
            },
        ]);
        if (!confirm) {
            console.log("🚫 Operation cancelled.");
            return;
        }
        await keytar.deletePassword(SERVICE_NAME, "privateKey");
        await keytar.deletePassword(SERVICE_NAME, "walletAddress");
        console.log("🗑️ Wallet deleted successfully!");
    }
    catch (error) {
        console.error("\n❌ Error deleting wallet:", error);
    }
});
program.parse(process.argv);
if (!process.argv.slice(2).length) {
    program.help();
}
process.on("SIGINT", () => {
    console.log("\n👋 Exiting program gracefully...");
    process.exit(0);
});
