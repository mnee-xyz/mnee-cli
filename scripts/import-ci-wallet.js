#!/usr/bin/env node
import keytar from 'keytar';

const SERVICE_NAME = 'mnee-cli';
const WALLETS_KEY = 'wallets';
const ACTIVE_WALLET_KEY = 'activeWallet';

async function importTestWallet() {
  try {
    const testWalletData = process.env.TEST_WALLET_DATA;
    
    if (!testWalletData) {
      throw new Error('TEST_WALLET_DATA environment variable not set');
    }
    
    const data = JSON.parse(testWalletData);
    
    if (!data.wallet || !data.privateKey) {
      throw new Error('Invalid wallet data format. Expected "wallet" and "privateKey" fields.');
    }
    
    if (!data.wallet.address) {
      throw new Error('Wallet address is required for import');
    }
    
    const activeWallet = {
      address: data.wallet.address,
      name: data.wallet.name,
      environment: data.wallet.environment,
      isActive: data.wallet.isActive
    };
    
    // Import active wallet
    await keytar.setPassword(SERVICE_NAME, ACTIVE_WALLET_KEY, JSON.stringify(activeWallet));
    console.log(`✅ Set active wallet: ${activeWallet.name}`);
    
    // Import the wallets list with just this wallet
    const wallets = [activeWallet];
    await keytar.setPassword(SERVICE_NAME, WALLETS_KEY, JSON.stringify(wallets));
    console.log(`✅ Imported 1 wallet`);
    
    // Import private key
    await keytar.setPassword(SERVICE_NAME, `privateKey_${activeWallet.address}`, data.privateKey);
    console.log(`✅ Imported private key`);
    
    console.log('\n✅ Wallet import complete! Ready for testing.\n');
    
  } catch (error) {
    console.error('❌ Failed to import wallet:', error.message);
    process.exit(1);
  }
}

importTestWallet();