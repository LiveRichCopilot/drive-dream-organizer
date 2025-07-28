import { tokenStorage } from './TokenStorage';
import { refreshQueue } from './RefreshQueue';

interface TokenRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export class AuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'NetworkError';
  }
}

class TokenManager {
  private baseURL = 'https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1';

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<string | null> {
    const accessToken = tokenStorage.getAccessToken();
    
    if (!accessToken) {
      return null;
    }

    // Check if token will expire soon and refresh preemptively
    if (tokenStorage.willExpireSoon(5)) {
      try {
        await this.refreshToken();
        return tokenStorage.getAccessToken();
      } catch (error) {
        console.error('Token refresh failed:', error);
        return null;
      }
    }

    return accessToken;
  }

  /**
   * Refresh the access token with exponential backoff retry logic
   */
  async refreshToken(): Promise<void> {
    const refreshToken = tokenStorage.getRefreshToken();
    
    if (!refreshToken) {
      throw new AuthError('No refresh token available');
    }

    return refreshQueue.executeRefresh(async () => {
      return this.performTokenRefresh(refreshToken);
    });
  }

  /**
   * Perform the actual token refresh with retry logic
   */
  private async performTokenRefresh(refreshToken: string): Promise<void> {
    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use Google's standard token refresh endpoint
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: await this.getGoogleClientId(),
            client_secret: await this.getGoogleClientSecret(),
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (!response.ok) {
          if (response.status === 400 || response.status === 401) {
            // Invalid refresh token - don't retry
            throw new AuthError('Invalid refresh token - re-authentication required');
          }
          throw new NetworkError(`Token refresh failed: ${response.status}`, response.status);
        }

        const data: TokenRefreshResponse = await response.json();
        
        // Store the new tokens
        tokenStorage.setTokens(
          data.access_token,
          data.refresh_token || refreshToken, // Keep existing refresh token if not provided
          data.expires_in
        );

        return;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on auth errors
        if (error instanceof AuthError) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Get Google Client ID from backend
   */
  private async getGoogleClientId(): Promise<string> {
    const response = await fetch(`${this.baseURL}/google-auth`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`,
      },
    });
    
    if (!response.ok) {
      throw new NetworkError('Failed to get Google client configuration');
    }
    
    const { client_id } = await response.json();
    return client_id;
  }

  /**
   * Get Google Client Secret from backend (this should be implemented in your backend)
   */
  private async getGoogleClientSecret(): Promise<string> {
    // In a real implementation, this should come from your secure backend
    // For now, we'll use the edge function approach
    throw new Error('Client secret should be handled by backend');
  }

  /**
   * Store tokens after successful authentication
   */
  setTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    tokenStorage.setTokens(accessToken, refreshToken, expiresIn);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const accessToken = tokenStorage.getAccessToken();
    return !!accessToken && !tokenStorage.isExpired();
  }

  /**
   * Get current access token (without refresh)
   */
  getAccessToken(): string | null {
    return tokenStorage.getAccessToken();
  }

  /**
   * Clear all tokens (logout)
   */
  logout(): void {
    tokenStorage.clearTokens();
  }

  /**
   * Make authenticated request with automatic token refresh
   */
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getValidToken();
    
    if (!token) {
      throw new AuthError('No valid token available - re-authentication required');
    }

    const requestOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    };

    const response = await fetch(url, requestOptions);

    // If we get 401, try refreshing token once
    if (response.status === 401) {
      try {
        await this.refreshToken();
        const newToken = tokenStorage.getAccessToken();
        
        if (newToken) {
          const retryOptions = {
            ...options,
            headers: {
              ...options.headers,
              'Authorization': `Bearer ${newToken}`,
            },
          };
          
          return fetch(url, retryOptions);
        }
      } catch (error) {
        throw new AuthError('Authentication failed - please re-login');
      }
    }

    return response;
  }
}

export const tokenManager = new TokenManager();