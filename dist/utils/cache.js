import fs from 'fs';
import path from 'path';
import os from 'os';
// Get the cache directory path
const getCacheDir = () => {
    const homeDir = os.homedir();
    const cacheDir = path.join(homeDir, '.mnee-cli', 'cache');
    // Create the directory if it doesn't exist
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    return cacheDir;
};
// Get the cache file path for a specific wallet
const getCacheFilePath = (wallet) => {
    const cacheDir = getCacheDir();
    return path.join(cacheDir, `tx-history-${wallet.address}.json`);
};
// Read the cache for a wallet
export const readTxHistoryCache = (wallet) => {
    try {
        const cachePath = getCacheFilePath(wallet);
        if (!fs.existsSync(cachePath)) {
            return null;
        }
        const cacheData = fs.readFileSync(cachePath, 'utf8');
        return JSON.parse(cacheData);
    }
    catch (error) {
        console.error('Error reading cache:', error);
        return null;
    }
};
// Write the cache for a wallet
export const writeTxHistoryCache = (wallet, history, nextScore) => {
    try {
        const cachePath = getCacheFilePath(wallet);
        const cacheData = {
            walletAddress: wallet.address,
            environment: wallet.environment,
            lastUpdated: Date.now(),
            nextScore,
            history,
        };
        fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
    }
    catch (error) {
        console.error('Error writing cache:', error);
    }
};
// Clear the cache for a wallet
export const clearTxHistoryCache = (wallet) => {
    try {
        const cachePath = getCacheFilePath(wallet);
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error('Error clearing cache:', error);
        return false;
    }
};
// Clear all caches
export const clearAllTxHistoryCaches = () => {
    try {
        const cacheDir = getCacheDir();
        if (fs.existsSync(cacheDir)) {
            const files = fs.readdirSync(cacheDir);
            for (const file of files) {
                if (file.startsWith('tx-history-') && file.endsWith('.json')) {
                    fs.unlinkSync(path.join(cacheDir, file));
                }
            }
        }
    }
    catch (error) {
        console.error('Error clearing all caches:', error);
    }
};
