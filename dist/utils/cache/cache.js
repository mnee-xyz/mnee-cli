import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
const CACHE_DIR = path.join(os.homedir(), '.mnee', 'cache');
const CACHE_TTL = 5 * 60 * 1000;
export class Cache {
    async ensureCacheDir() {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    }
    getCacheFile(walletAddress, environment) {
        return path.join(CACHE_DIR, `history_${environment}_${walletAddress}.json`);
    }
    async get(walletAddress, environment) {
        try {
            const cacheFile = this.getCacheFile(walletAddress, environment);
            const data = await fs.readFile(cacheFile, 'utf-8');
            const cached = JSON.parse(data);
            // Check if cache is still valid
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                return cached.data;
            }
            // Cache expired, delete it
            await fs.unlink(cacheFile).catch(() => { });
            return null;
        }
        catch {
            return null;
        }
    }
    async set(walletAddress, environment, data) {
        try {
            await this.ensureCacheDir();
            const cached = {
                data,
                timestamp: Date.now(),
                walletAddress,
                environment
            };
            const cacheFile = this.getCacheFile(walletAddress, environment);
            await fs.writeFile(cacheFile, JSON.stringify(cached, null, 2));
        }
        catch (error) {
            // Fail silently - caching is optional
            console.warn('Cache write failed:', error);
        }
    }
    async clear(walletAddress, environment) {
        try {
            if (walletAddress && environment) {
                // Clear specific wallet cache
                const cacheFile = this.getCacheFile(walletAddress, environment);
                await fs.unlink(cacheFile);
            }
            else {
                // Clear all caches
                const files = await fs.readdir(CACHE_DIR);
                await Promise.all(files.map(file => fs.unlink(path.join(CACHE_DIR, file)).catch(() => { })));
            }
        }
        catch {
            // Fail silently
        }
    }
    async exists(walletAddress, environment) {
        const data = await this.get(walletAddress, environment);
        return data !== null;
    }
    async getAge(walletAddress, environment) {
        try {
            const cacheFile = this.getCacheFile(walletAddress, environment);
            const data = await fs.readFile(cacheFile, 'utf-8');
            const cached = JSON.parse(data);
            return Date.now() - cached.timestamp;
        }
        catch {
            return null;
        }
    }
}
