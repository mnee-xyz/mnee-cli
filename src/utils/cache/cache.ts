import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const CACHE_DIR = path.join(os.homedir(), '.mnee', 'cache');
const CACHE_TTL = 5 * 60 * 1000;

interface CachedData {
  data: any;
  timestamp: number;
  walletAddress: string;
  environment: string;
}

export class Cache {
  private async ensureCacheDir(): Promise<void> {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  }

  private getCacheFile(walletAddress: string, environment: string): string {
    return path.join(CACHE_DIR, `history_${environment}_${walletAddress}.json`);
  }

  async get(walletAddress: string, environment: string): Promise<any | null> {
    try {
      const cacheFile = this.getCacheFile(walletAddress, environment);
      const data = await fs.readFile(cacheFile, 'utf-8');
      const cached: CachedData = JSON.parse(data);
      
      // Check if cache is still valid
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
      
      // Cache expired, delete it
      await fs.unlink(cacheFile).catch(() => {});
      return null;
    } catch {
      return null;
    }
  }

  async set(walletAddress: string, environment: string, data: any): Promise<void> {
    try {
      await this.ensureCacheDir();
      
      const cached: CachedData = {
        data,
        timestamp: Date.now(),
        walletAddress,
        environment
      };
      
      const cacheFile = this.getCacheFile(walletAddress, environment);
      await fs.writeFile(cacheFile, JSON.stringify(cached, null, 2));
    } catch (error) {
      // Fail silently - caching is optional
      console.warn('Cache write failed:', error);
    }
  }

  async clear(walletAddress?: string, environment?: string): Promise<void> {
    try {
      if (walletAddress && environment) {
        // Clear specific wallet cache
        const cacheFile = this.getCacheFile(walletAddress, environment);
        await fs.unlink(cacheFile);
      } else {
        // Clear all caches
        const files = await fs.readdir(CACHE_DIR);
        await Promise.all(
          files.map(file => fs.unlink(path.join(CACHE_DIR, file)).catch(() => {}))
        );
      }
    } catch {
      // Fail silently
    }
  }

  async exists(walletAddress: string, environment: string): Promise<boolean> {
    const data = await this.get(walletAddress, environment);
    return data !== null;
  }

  async getAge(walletAddress: string, environment: string): Promise<number | null> {
    try {
      const cacheFile = this.getCacheFile(walletAddress, environment);
      const data = await fs.readFile(cacheFile, 'utf-8');
      const cached: CachedData = JSON.parse(data);
      return Date.now() - cached.timestamp;
    } catch {
      return null;
    }
  }
}