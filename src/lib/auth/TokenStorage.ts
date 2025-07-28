interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

class TokenStorage {
  private static ACCESS_TOKEN_KEY = 'google_access_token';
  private static REFRESH_TOKEN_KEY = 'google_refresh_token';
  private static EXPIRES_AT_KEY = 'google_token_expires_at';

  /**
   * Store tokens with multiple fallback mechanisms
   */
  setTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    const expiresAt = expiresIn ? Date.now() + (expiresIn * 1000) : Date.now() + (3600 * 1000); // Default 1 hour
    
    // Primary storage in localStorage
    try {
      localStorage.setItem(TokenStorage.ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(TokenStorage.EXPIRES_AT_KEY, expiresAt.toString());
      
      if (refreshToken) {
        localStorage.setItem(TokenStorage.REFRESH_TOKEN_KEY, refreshToken);
      }
    } catch (error) {
      console.warn('localStorage not available, falling back to sessionStorage');
    }

    // Fallback to sessionStorage
    try {
      sessionStorage.setItem(TokenStorage.ACCESS_TOKEN_KEY, accessToken);
      sessionStorage.setItem(TokenStorage.EXPIRES_AT_KEY, expiresAt.toString());
      
      if (refreshToken) {
        sessionStorage.setItem(TokenStorage.REFRESH_TOKEN_KEY, refreshToken);
      }
    } catch (error) {
      console.warn('sessionStorage not available');
    }
  }

  /**
   * Get access token with fallback mechanism
   */
  getAccessToken(): string | null {
    return this.getFromStorage(TokenStorage.ACCESS_TOKEN_KEY);
  }

  /**
   * Get refresh token with fallback mechanism
   */
  getRefreshToken(): string | null {
    return this.getFromStorage(TokenStorage.REFRESH_TOKEN_KEY);
  }

  /**
   * Get token expiry time
   */
  getExpiresAt(): number | null {
    const expiresAt = this.getFromStorage(TokenStorage.EXPIRES_AT_KEY);
    return expiresAt ? parseInt(expiresAt) : null;
  }

  /**
   * Check if token will expire within the specified minutes
   */
  willExpireSoon(withinMinutes: number = 5): boolean {
    const expiresAt = this.getExpiresAt();
    if (!expiresAt) return true;
    
    const timeUntilExpiry = expiresAt - Date.now();
    const minutesUntilExpiry = timeUntilExpiry / (1000 * 60);
    
    return minutesUntilExpiry <= withinMinutes;
  }

  /**
   * Check if token is expired
   */
  isExpired(): boolean {
    const expiresAt = this.getExpiresAt();
    if (!expiresAt) return true;
    
    return Date.now() >= expiresAt;
  }

  /**
   * Clear all tokens
   */
  clearTokens(): void {
    // Clear from localStorage
    try {
      localStorage.removeItem(TokenStorage.ACCESS_TOKEN_KEY);
      localStorage.removeItem(TokenStorage.REFRESH_TOKEN_KEY);
      localStorage.removeItem(TokenStorage.EXPIRES_AT_KEY);
    } catch (error) {
      // Ignore localStorage errors
    }

    // Clear from sessionStorage
    try {
      sessionStorage.removeItem(TokenStorage.ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(TokenStorage.REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(TokenStorage.EXPIRES_AT_KEY);
    } catch (error) {
      // Ignore sessionStorage errors
    }
  }

  /**
   * Get value from storage with fallback mechanism
   */
  private getFromStorage(key: string): string | null {
    // Try localStorage first
    try {
      const value = localStorage.getItem(key);
      if (value) return value;
    } catch (error) {
      // localStorage not available or failed
    }

    // Fallback to sessionStorage
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all token data at once
   */
  getTokenData(): TokenData | null {
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();
    const expiresAt = this.getExpiresAt();

    if (!accessToken) return null;

    return {
      access_token: accessToken,
      refresh_token: refreshToken || '',
      expires_at: expiresAt || 0
    };
  }
}

export const tokenStorage = new TokenStorage();