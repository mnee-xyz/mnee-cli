#!/usr/bin/env node
import keytar from 'keytar';

const SERVICE_NAME = 'mnee-cli';
const WALLETS_KEY = 'wallets';
const ACTIVE_WALLET_KEY = 'activeWallet';

async function verifyWallet() {
  try {
    // Check active wallet
    const activeWalletJson = await keytar.getPassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
    const activeWallet = activeWalletJson ? JSON.parse(activeWalletJson) : null;
    
    // Check wallets list
    const walletsJson = await keytar.getPassword(SERVICE_NAME, WALLETS_KEY);
    const wallets = walletsJson ? JSON.parse(walletsJson) : [];
    
    console.log('\n=== Wallet Verification ===');
    
    if (!activeWallet) {
      console.error('❌ No active wallet found!');
      process.exit(1);
    }
    
    console.log(`✅ Active wallet found: ${activeWallet.name}`);
    console.log(`   Environment: ${activeWallet.environment}`);
    console.log(`   Address: ${activeWallet.address.slice(0, 10)}...`);
    
    // Check if private key exists
    const privateKey = await keytar.getPassword(SERVICE_NAME, `privateKey_${activeWallet.address}`);
    
    if (!privateKey) {
      console.error('❌ Private key not found for active wallet!');
      process.exit(1);
    }
    
    console.log(`✅ Private key stored: Yes`);
    
    // Verify wallets list contains the active wallet
    const walletInList = wallets.find(w => w.address === activeWallet.address);
    if (walletInList) {
      console.log(`✅ Wallet found in wallets list`);
    } else {
      console.log(`⚠️  Warning: Wallet not in wallets list (${wallets.length} wallets total)`);
    }
    
    console.log('\n✅ Wallet verification complete! Ready for testing.');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyWallet();