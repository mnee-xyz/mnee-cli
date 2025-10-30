#!/usr/bin/env node
import keytar from 'keytar';

const SERVICE_NAME = 'mnee-cli';
const ACTIVE_WALLET_KEY = 'activeWallet';

async function exportTestWallet() {
  try {
    // Get active wallet
    const activeWalletJson = await keytar.getPassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
    const activeWallet = activeWalletJson ? JSON.parse(activeWalletJson) : null;
    
    if (!activeWallet) {
      console.error('No active wallet found');
      process.exit(1);
    }
    
    // Get private key for active wallet only
    const privateKey = await keytar.getPassword(SERVICE_NAME, `privateKey_${activeWallet.address}`);
    
    if (!privateKey) {
      console.error('Private key not found for active wallet');
      process.exit(1);
    }
    
    const exportData = {
      wallet: {
        address: activeWallet.address,
        name: activeWallet.name,
        environment: activeWallet.environment,
        isActive: activeWallet.isActive
      },
      privateKey
    };
    
    console.log('\n=== WALLET EXPORT DATA ===\n');
    console.log(JSON.stringify(exportData, null, 2));
    
  } catch (error) {
    console.error('Error exporting wallet:', error);
    process.exit(1);
  }
}

exportTestWallet();