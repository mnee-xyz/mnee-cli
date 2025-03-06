#!/usr/bin/env node
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Command } from "commander";
import inquirer from "inquirer";
import keytar from "keytar";
import crypto from "crypto";
import { PrivateKey } from "@bsv/sdk";
import { decryptPrivateKey, encryptPrivateKey } from "./utils/crytpo.js";
import { singleLineLogger } from "./utils/helper.js";
import MNEE from "mnee-ops";
const mneeClient = MNEE();
const program = new Command();
const SERVICE_NAME = "mnee-cli";
const safePrompt = (questions) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield inquirer.prompt(questions);
    }
    catch (_a) {
        console.log("\n❌ Operation cancelled by user.");
        process.exit(1);
    }
});
program
    .command("create")
    .description("Generate a new wallet and store keys securely")
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const existingAddress = yield keytar.getPassword(SERVICE_NAME, "walletAddress");
        if (existingAddress) {
            console.error("❌ Wallet already exists. Run `mnee export-key` to retrieve keys.");
            return;
        }
        const entropy = crypto.randomBytes(32);
        const privateKey = PrivateKey.fromString(entropy.toString("hex"));
        const address = privateKey.toAddress();
        const { password, confirmPassword } = yield safePrompt([
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
        yield keytar.setPassword(SERVICE_NAME, "privateKey", encryptedKey);
        yield keytar.setPassword(SERVICE_NAME, "walletAddress", address);
        console.log("\n✅ Wallet created successfully!");
        console.log(`\n${address}\n`);
    }
    catch (error) {
        console.error("\n❌ Error creating wallet:", error);
    }
}));
program
    .command("address")
    .description("Retrieve your wallet address")
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    const address = yield keytar.getPassword(SERVICE_NAME, "walletAddress");
    if (!address) {
        console.error("❌ No wallet found. Run `mnee create-wallet` first.");
        return;
    }
    console.log(`\n${address}\n`);
}));
program
    .command("balance")
    .description("Get the balance of the wallet")
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    const address = yield keytar.getPassword(SERVICE_NAME, "walletAddress");
    if (!address) {
        console.error("❌ No wallet found. Run `mnee create-wallet` first.");
        return;
    }
    singleLineLogger.start("Fetching balance...");
    const { decimalAmount } = yield mneeClient.balance(address);
    singleLineLogger.done(`\n$${decimalAmount} MNEE\n`);
}));
program
    .command("transfer")
    .description("Transfer MNEE to another address")
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const address = yield keytar.getPassword(SERVICE_NAME, "walletAddress");
        if (!address) {
            console.error("❌ No wallet found. Run `mnee create-wallet` first.");
            return;
        }
        const { amount, toAddress } = yield safePrompt([
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
        const { password } = yield safePrompt([
            {
                type: "password",
                name: "password",
                message: "Enter your wallet password:",
                mask: "*",
            },
        ]);
        const encryptedKey = yield keytar.getPassword(SERVICE_NAME, "privateKey");
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
        const { txid, error } = yield mneeClient.transfer(request, privateKey.toWif());
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
}));
program
    .command("export")
    .description("Decrypt and retrieve your private key in WIF format")
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { password } = yield safePrompt([
            {
                type: "password",
                name: "password",
                message: "Enter your wallet password:",
                mask: "*",
            },
        ]);
        const encryptedKey = yield keytar.getPassword(SERVICE_NAME, "privateKey");
        const address = yield keytar.getPassword(SERVICE_NAME, "walletAddress");
        if (!encryptedKey || !address) {
            console.error("❌ No wallet found. Run `mnee create-wallet` first.");
            return;
        }
        const { confirm } = yield safePrompt([
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
}));
program
    .command("delete")
    .description("Delete your wallet and all stored keys")
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { confirm } = yield safePrompt([
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
        yield keytar.deletePassword(SERVICE_NAME, "privateKey");
        yield keytar.deletePassword(SERVICE_NAME, "walletAddress");
        console.log("🗑️ Wallet deleted successfully!");
    }
    catch (error) {
        console.error("\n❌ Error deleting wallet:", error);
    }
}));
program.parse(process.argv);
if (!process.argv.slice(2).length) {
    program.help();
}
process.on("SIGINT", () => {
    console.log("\n👋 Exiting program gracefully...");
    process.exit(0);
});
