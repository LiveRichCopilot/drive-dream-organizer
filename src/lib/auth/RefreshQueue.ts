interface RefreshPromise {
  resolve: (value: boolean) => void;
  reject: (reason?: any) => void;
}

class RefreshQueue {
  private isRefreshing = false;
  private refreshPromises: RefreshPromise[] = [];

  /**
   * Execute refresh operation ensuring only one runs at a time
   */
  async executeRefresh<T>(refreshFunction: () => Promise<T>): Promise<T> {
    if (this.isRefreshing) {
      // Wait for current refresh to complete
      return new Promise((resolve, reject) => {
        this.refreshPromises.push({ resolve: resolve as any, reject });
      });
    }

    this.isRefreshing = true;
    
    try {
      const result = await refreshFunction();
      
      // Resolve all waiting promises
      this.refreshPromises.forEach(promise => promise.resolve(true));
      this.refreshPromises = [];
      
      return result;
    } catch (error) {
      // Reject all waiting promises
      this.refreshPromises.forEach(promise => promise.reject(error));
      this.refreshPromises = [];
      
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Check if a refresh is currently in progress
   */
  isRefreshInProgress(): boolean {
    return this.isRefreshing;
  }
}

export const refreshQueue = new RefreshQueue();