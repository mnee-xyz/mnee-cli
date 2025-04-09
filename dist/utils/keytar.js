import keytar from 'keytar';
export const SERVICE_NAME = 'mnee-cli';
export const WALLETS_KEY = 'wallets';
export const ACTIVE_WALLET_KEY = 'activeWallet';
export const LEGACY_WALLET_ADDRESS_KEY = 'walletAddress';
export const LEGACY_PRIVATE_KEY_KEY = 'privateKey';
// Wallet list management
export const getAllWallets = async () => {
    const walletsJson = await keytar.getPassword(SERVICE_NAME, WALLETS_KEY);
    return walletsJson ? JSON.parse(walletsJson) : [];
};
export const saveWallets = async (wallets) => {
    await keytar.setPassword(SERVICE_NAME, WALLETS_KEY, JSON.stringify(wallets));
};
// Active wallet management
export const getActiveWallet = async () => {
    const activeWalletJson = await keytar.getPassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
    return activeWalletJson ? JSON.parse(activeWalletJson) : null;
};
export const setActiveWallet = async (wallet) => {
    await keytar.setPassword(SERVICE_NAME, ACTIVE_WALLET_KEY, JSON.stringify(wallet));
};
export const clearActiveWallet = async () => {
    await keytar.deletePassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
};
// Private key management
export const getPrivateKey = async (address) => {
    return await keytar.getPassword(SERVICE_NAME, `privateKey_${address}`);
};
export const setPrivateKey = async (address, encryptedKey) => {
    await keytar.setPassword(SERVICE_NAME, `privateKey_${address}`, encryptedKey);
};
export const deletePrivateKey = async (address) => {
    await keytar.deletePassword(SERVICE_NAME, `privateKey_${address}`);
};
// Legacy wallet management - Used for migrating from single wallet to multiple wallets
export const getLegacyWallet = async () => {
    const [address, privateKey] = await Promise.all([
        keytar.getPassword(SERVICE_NAME, LEGACY_WALLET_ADDRESS_KEY),
        keytar.getPassword(SERVICE_NAME, LEGACY_PRIVATE_KEY_KEY),
    ]);
    return { address, privateKey };
};
export const deleteLegacyWallet = async () => {
    await Promise.all([
        keytar.deletePassword(SERVICE_NAME, LEGACY_WALLET_ADDRESS_KEY),
        keytar.deletePassword(SERVICE_NAME, LEGACY_PRIVATE_KEY_KEY),
    ]);
};
// Wallet validation functions
export const walletExists = async (address) => {
    const wallets = await getAllWallets();
    return wallets.some((w) => w.address === address);
};
export const getWalletByAddress = async (address) => {
    const wallets = await getAllWallets();
    return wallets.find((w) => w.address === address) || null;
};
export const getWalletByName = async (name) => {
    const wallets = await getAllWallets();
    return wallets.find((w) => w.name === name) || null;
};
