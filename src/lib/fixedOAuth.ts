
// Enhanced Google OAuth implementation following Google's best practices
export class FixedGoogleOAuth {
  private clientId = '1070421026009-ihbdicu5n4b198qi8uoav1b284fefdcd.apps.googleusercontent.com';
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: number | null = null;
  
  constructor() {
    // Load existing tokens from localStorage
    this.loadTokensFromStorage();
    
    // Check if we're returning from OAuth redirect
    this.handleOAuthCallback();
  }

  private loadTokensFromStorage(): void {
    try {
      this.accessToken = localStorage.getItem('google_access_token');
      this.refreshToken = localStorage.getItem('google_refresh_token');
      const expiresAt = localStorage.getItem('google_expires_at');
      this.expiresAt = expiresAt ? parseInt(expiresAt) : null;
    } catch (error) {
      console.warn('Failed to load tokens from storage:', error);
    }
  }

  private saveTokensToStorage(): void {
    try {
      if (this.accessToken) {
        localStorage.setItem('google_access_token', this.accessToken);
      }
      if (this.refreshToken) {
        localStorage.setItem('google_refresh_token', this.refreshToken);
      }
      if (this.expiresAt) {
        localStorage.setItem('google_expires_at', this.expiresAt.toString());
      }
    } catch (error) {
      console.warn('Failed to save tokens to storage:', error);
    }
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }

  private isTokenExpired(): boolean {
    if (!this.expiresAt) return false;
    // Add 5 minute buffer to prevent edge cases
    return Date.now() >= (this.expiresAt - 300000);
  }

  private handleOAuthCallback(): void {
    // Check if we have an access token in the URL hash (OAuth callback)
    if (window.location.hash.includes('access_token=')) {
      const urlParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = urlParams.get('access_token');
      const error = urlParams.get('error');
      const expiresIn = urlParams.get('expires_in');
      
      if (error) {
        console.error('OAuth Error:', error);
        const errorDescription = urlParams.get('error_description') || error;
        throw new Error(`Google authentication failed: ${errorDescription}`);
      }
      
      if (accessToken) {
        this.accessToken = accessToken;
        // Calculate expiry time (Google typically returns 3600 seconds)
        const expiresInSeconds = expiresIn ? parseInt(expiresIn) : 3600;
        this.expiresAt = Date.now() + (expiresInSeconds * 1000);
        
        this.saveTokensToStorage();
        
        // Clean up the URL hash
        window.history.replaceState({}, document.title, window.location.pathname);
        
        console.log('✅ OAuth successful - tokens stored');
      }
    }
  }

  async authenticate(): Promise<void> {
    // Check if we already have valid tokens
    if (this.isAuthenticated()) {
      console.log('Already authenticated');
      return;
    }

    // Try to refresh token if we have one
    if (this.refreshToken && this.isTokenExpired()) {
      try {
        await this.refreshAccessToken();
        return;
      } catch (error) {
        console.warn('Token refresh failed, proceeding with full authentication');
        this.logout(); // Clear invalid tokens
      }
    }

    // Use popup instead of redirect for better UX
    return new Promise((resolve, reject) => {
      const redirectUri = `${window.location.origin}/auth/callback`;
      
      // Generate state parameter for security
      const state = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('oauth_state', state);
      
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        `client_id=${this.clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file')}&` +
        `state=${state}&` +
        `access_type=offline&` +
        `prompt=consent`;
      
      console.log('🔗 Opening OAuth popup...');
      
      const popup = window.open(
        authUrl,
        'google-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        reject(new Error('Popup blocked. Please allow popups and try again.'));
        return;
      }

      // Listen for messages from the popup
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'OAUTH_SUCCESS') {
          window.removeEventListener('message', messageHandler);
          popup.close();
          
          // Store the authorization code and exchange it for tokens
          this.exchangeCodeForTokens(event.data.code)
            .then(() => resolve())
            .catch(reject);
        } else if (event.data.type === 'OAUTH_ERROR') {
          window.removeEventListener('message', messageHandler);
          popup.close();
          reject(new Error(event.data.error || 'OAuth failed'));
        }
      };

      window.addEventListener('message', messageHandler);

      // Check if popup is closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          reject(new Error('Authentication was cancelled'));
        }
      }, 1000);
    });
  }

  private async exchangeCodeForTokens(code: string): Promise<void> {
    try {
      // Exchange authorization code for tokens using our edge function
      const response = await fetch('/functions/v1/google-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify({
          code
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Token exchange failed: ${errorData.error || response.status}`);
      }

      const data = await response.json();
      
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      // Default to 1 hour if expires_in not provided
      this.expiresAt = Date.now() + (3600 * 1000);
      
      this.saveTokensToStorage();
      console.log('✅ OAuth successful - tokens stored');
      
    } catch (error) {
      console.error('Token exchange failed:', error);
      throw new Error('Failed to complete authentication');
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in * 1000);
    
    // Update refresh token if provided
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }

    this.saveTokensToStorage();
    console.log('✅ Access token refreshed');
  }

  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    // Ensure we have a valid token
    if (!this.isAuthenticated()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('Not authenticated - please call authenticate() first');
      }
    }

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle token expiration
    if (response.status === 401) {
      if (this.refreshToken) {
        try {
          await this.refreshAccessToken();
          // Retry the request with new token
          return await fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              'Authorization': `Bearer ${this.accessToken}`,
            },
          });
        } catch (refreshError) {
          this.logout();
          throw new Error('Authentication expired and refresh failed - please reconnect');
        }
      } else {
        this.logout();
        throw new Error('Authentication expired - please reconnect to Google Drive');
      }
    }

    return response;
  }

  async listFiles(folderId?: string): Promise<any[]> {
    // Build query following Google Drive API best practices
    let query = "mimeType contains 'video/' or mimeType contains 'image/'";
    
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    // Add additional filters to exclude system files
    query += " and trashed = false";

    const url = `https://www.googleapis.com/drive/v3/files?` +
      `q=${encodeURIComponent(query)}&` +
      `fields=files(id,name,size,createdTime,modifiedTime,thumbnailLink,mimeType,videoMediaMetadata,imageMediaMetadata,webViewLink,parents)&` +
      `pageSize=1000&` +
      `orderBy=createdTime desc`;

    const response = await this.makeAuthenticatedRequest(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch files: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    // Transform the data to match expected format
    return (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      size: parseInt(file.size) || 0,
      sizeFormatted: this.formatFileSize(parseInt(file.size) || 0),
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      thumbnailLink: file.thumbnailLink,
      webViewLink: file.webViewLink,
      mimeType: file.mimeType,
      fileType: file.mimeType.startsWith('video/') ? 'video' : 
                file.mimeType.startsWith('image/') ? 'image' : 'other',
      duration: file.videoMediaMetadata?.durationMillis ? 
        parseInt(file.videoMediaMetadata.durationMillis) / 1000 : undefined,
      durationFormatted: file.videoMediaMetadata?.durationMillis ? 
        this.formatDuration(parseInt(file.videoMediaMetadata.durationMillis) / 1000) : undefined,
      thumbnail: file.thumbnailLink || '',
      format: this.getFileExtension(file.name),
      dateCreated: new Date(file.createdTime).toLocaleDateString(),
      parents: file.parents || [],
      metadata: {
        video: file.videoMediaMetadata,
        image: file.imageMediaMetadata
      }
    }));
  }

  async getFileMetadata(fileId: string): Promise<any> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?` +
      `fields=id,name,size,createdTime,modifiedTime,thumbnailLink,mimeType,videoMediaMetadata,imageMediaMetadata,webViewLink,parents`;

    const response = await this.makeAuthenticatedRequest(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file metadata: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async downloadFile(fileId: string): Promise<string> {
    // For Google Drive, we can use the direct download URL with authentication
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    
    // Verify we can access the file first
    const response = await this.makeAuthenticatedRequest(url, { method: 'HEAD' });
    
    if (!response.ok) {
      throw new Error(`Cannot access file for download: ${response.status} ${response.statusText}`);
    }

    // Return the authenticated download URL
    return url;
  }

  async createFolder(name: string, parentId?: string): Promise<string> {
    const metadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] })
    };

    const response = await this.makeAuthenticatedRequest(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create folder: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.id;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
    
    try {
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_refresh_token');
      localStorage.removeItem('google_expires_at');
    } catch (error) {
      console.warn('Failed to clear tokens from storage:', error);
    }
    
    console.log('🚪 Logged out - tokens cleared');
  }
}

// Export singleton instance
export const fixedGoogleOAuth = new FixedGoogleOAuth();
