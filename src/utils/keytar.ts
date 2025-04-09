import keytar from 'keytar';

export type WalletEnvironment = 'production' | 'sandbox';
export type WalletInfo = {
  address: string;
  environment: WalletEnvironment;
  name: string;
  isActive: boolean;
};

export const SERVICE_NAME = 'mnee-cli';
export const WALLETS_KEY = 'wallets';
export const ACTIVE_WALLET_KEY = 'activeWallet';
export const LEGACY_WALLET_ADDRESS_KEY = 'walletAddress';
export const LEGACY_PRIVATE_KEY_KEY = 'privateKey';

// Wallet list management
export const getAllWallets = async (): Promise<WalletInfo[]> => {
  const walletsJson = await keytar.getPassword(SERVICE_NAME, WALLETS_KEY);
  return walletsJson ? JSON.parse(walletsJson) : [];
};

export const saveWallets = async (wallets: WalletInfo[]): Promise<void> => {
  await keytar.setPassword(SERVICE_NAME, WALLETS_KEY, JSON.stringify(wallets));
};

// Active wallet management
export const getActiveWallet = async (): Promise<WalletInfo | null> => {
  const activeWalletJson = await keytar.getPassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
  return activeWalletJson ? JSON.parse(activeWalletJson) : null;
};

export const setActiveWallet = async (wallet: WalletInfo): Promise<void> => {
  await keytar.setPassword(SERVICE_NAME, ACTIVE_WALLET_KEY, JSON.stringify(wallet));
};

export const clearActiveWallet = async (): Promise<void> => {
  await keytar.deletePassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
};

// Private key management
export const getPrivateKey = async (address: string): Promise<string | null> => {
  return await keytar.getPassword(SERVICE_NAME, `privateKey_${address}`);
};

export const setPrivateKey = async (address: string, encryptedKey: string): Promise<void> => {
  await keytar.setPassword(SERVICE_NAME, `privateKey_${address}`, encryptedKey);
};

export const deletePrivateKey = async (address: string): Promise<void> => {
  await keytar.deletePassword(SERVICE_NAME, `privateKey_${address}`);
};

// Legacy wallet management - Used for migrating from single wallet to multiple wallets
export const getLegacyWallet = async (): Promise<{ address: string | null; privateKey: string | null }> => {
  const [address, privateKey] = await Promise.all([
    keytar.getPassword(SERVICE_NAME, LEGACY_WALLET_ADDRESS_KEY),
    keytar.getPassword(SERVICE_NAME, LEGACY_PRIVATE_KEY_KEY),
  ]);
  return { address, privateKey };
};

export const deleteLegacyWallet = async (): Promise<void> => {
  await Promise.all([
    keytar.deletePassword(SERVICE_NAME, LEGACY_WALLET_ADDRESS_KEY),
    keytar.deletePassword(SERVICE_NAME, LEGACY_PRIVATE_KEY_KEY),
  ]);
};

// Wallet validation functions
export const walletExists = async (address: string): Promise<boolean> => {
  const wallets = await getAllWallets();
  return wallets.some((w) => w.address === address);
};

export const getWalletByAddress = async (address: string): Promise<WalletInfo | null> => {
  const wallets = await getAllWallets();
  return wallets.find((w) => w.address === address) || null;
};

export const getWalletByName = async (name: string): Promise<WalletInfo | null> => {
  const wallets = await getAllWallets();
  return wallets.find((w) => w.name === name) || null;
};
