
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
      
      // Comprehensive scopes for Drive, Calendar, and Gmail
      const scopes = [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file', 
        'https://www.googleapis.com/auth/drive.metadata',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
      ].join(' ');
      
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        `client_id=${this.clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${state}&` +
        `access_type=offline&` +
        `prompt=select_account consent`;
      
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

      // Set up timeout for popup closure detection instead of polling
      const timeout = setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        try {
          if (!popup.closed) {
            popup.close();
          }
        } catch (e) {
          // Ignore Cross-Origin-Opener-Policy errors
        }
        reject(new Error('Authentication was cancelled'));
      }, 300000); // 5 minute timeout

      // Clean up timeout on successful message
      const originalMessageHandler = messageHandler;
      const wrappedMessageHandler = (event: MessageEvent) => {
        clearTimeout(timeout);
        originalMessageHandler(event);
      };
      
      window.removeEventListener('message', messageHandler);
      window.addEventListener('message', wrappedMessageHandler);
    });
  }

  private async exchangeCodeForTokens(code: string): Promise<void> {
    try {
      // Exchange authorization code for tokens using our edge function
      const response = await fetch(`https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1/google-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`
        },
        body: JSON.stringify({
          code,
          redirect_uri: `${window.location.origin}/auth/callback`
        })
      });

      console.log('Edge function response status:', response.status);
      console.log('Edge function response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge function error response:', errorText);
        throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
      }

      const responseText = await response.text();
      console.log('Raw response:', responseText);
      
      if (!responseText) {
        throw new Error('Empty response from token exchange');
      }

      const data = JSON.parse(responseText);
      
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      // Default to 1 hour if expires_in not provided
      this.expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
      
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

    try {
      // Use edge function for token refresh to avoid CORS and client secret issues
      const response = await fetch(`https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1/google-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`
        },
        body: JSON.stringify({
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token refresh error response:', errorText);
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
      
      // Update refresh token if provided
      if (data.refresh_token) {
        this.refreshToken = data.refresh_token;
      }

      this.saveTokensToStorage();
      console.log('✅ Access token refreshed');
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
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
