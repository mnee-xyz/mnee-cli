import { Cache } from './cache.js';

export class HistoryFetcher {
  private cache = new Cache();

  async getHistory(
    activeWallet: any,
    mneeInstance: any,
    options: { refresh?: boolean; limit?: number } = {}
  ): Promise<any[]> {
    const { refresh = false, limit = 50 } = options;

    // Cache first
    if (!refresh) {
      const cached = await this.cache.get(activeWallet.address, activeWallet.environment);
      if (cached) {
        return this.applyLimit(cached, limit);
      }
    }

    // Fetch data from API
    const { history } = await mneeInstance.recentTxHistory(
      activeWallet.address,
      undefined,
      limit * 2,
      'desc'
    );

    const enrichedHistory = history.map((tx: any) => ({
      ...tx,
      computedAmount: mneeInstance.fromAtomicAmount(tx.amount || 0),
      computedFee: mneeInstance.fromAtomicAmount(tx.fee || 0),
      computedCounterparties: tx.counterparties?.map((cp: any) => ({
        ...cp,
        computedAmount: mneeInstance.fromAtomicAmount(cp.amount || 0),
      })) || []
    }));

    // Cache the results
    await this.cache.set(activeWallet.address, activeWallet.environment, enrichedHistory);

    return this.applyLimit(enrichedHistory, limit);
  }

  private applyLimit(transactions: any[], limit: number): any[] {
    if (limit > 0) {
      return transactions.slice(0, limit);
    }
    return transactions;
  }

  async filterHistory(
    activeWallet: any,
    mneeInstance: any,
    filters: {
      txid?: string;
      type?: 'send' | 'receive';
      address?: string;
      confirmed?: boolean;
      unconfirmed?: boolean;
      min?: number;
      max?: number;
      limit?: number;
      refresh?: boolean;
    } = {}
  ): Promise<any[]> {
    // Get full history
    const history = await this.getHistory(activeWallet, mneeInstance, {
      refresh: filters.refresh,
      limit: 0
    });

    // Apply filters
    let filtered = history.filter((tx: any) => {
      if (filters.confirmed && tx.status !== 'confirmed') return false;
      if (filters.unconfirmed && tx.status !== 'unconfirmed') return false;
      if (filters.type && tx.type !== filters.type) return false;
      if (filters.txid && !tx.txid.toLowerCase().includes(filters.txid.toLowerCase())) {
        return false;
      }
      if (filters.address) {
        const hasAddress = tx.computedCounterparties.some((cp: any) => 
          cp.address.toLowerCase().includes(filters.address!.toLowerCase())
        );
        if (!hasAddress) return false;
      }
      if (filters.min !== undefined && tx.computedAmount < filters.min) return false;
      if (filters.max !== undefined && tx.computedAmount > filters.max) return false;
      
      return true;
    });
    if (filters.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  async clearCache(walletAddress?: string, environment?: string): Promise<void> {
    await this.cache.clear(walletAddress, environment);
  }

  async getCacheInfo(walletAddress: string, environment: string): Promise<{
    exists: boolean;
    age?: number;
    ageText?: string;
    transactionCount?: number;
  }> {
    const exists = await this.cache.exists(walletAddress, environment);
    
    if (!exists) {
      return { exists: false };
    }

    const age = await this.cache.getAge(walletAddress, environment);
    const cached = await this.cache.get(walletAddress, environment);
    
    let ageText = '';
    if (age) {
      const seconds = Math.floor(age / 1000);
      const minutes = Math.floor(seconds / 60);
      ageText = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
    }

    return {
      exists: true,
      age: age ?? undefined,
      ageText,
      transactionCount: cached?.length || 0
    };
  }
}