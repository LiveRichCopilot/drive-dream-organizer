// Fixed Google OAuth implementation that actually works
export class FixedGoogleOAuth {
  private clientId = '1070421026009-ihbdicu5n4b198qi8uoav1b284fefdcd.apps.googleusercontent.com';
  private accessToken: string | null = null;
  
  constructor() {
    // Load existing token from localStorage
    this.accessToken = localStorage.getItem('google_access_token');
    
    // Check if we're returning from OAuth redirect
    this.handleOAuthCallback();
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  private handleOAuthCallback(): void {
    // Check if we have an access token in the URL hash (OAuth callback)
    if (window.location.hash.includes('access_token=')) {
      const urlParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = urlParams.get('access_token');
      const error = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');
      
      console.log('🔍 OAuth Callback Details:');
      console.log('  - Full URL:', window.location.href);
      console.log('  - Hash:', window.location.hash);
      console.log('  - Access Token:', accessToken ? 'Present' : 'Missing');
      console.log('  - Error:', error);
      console.log('  - Error Description:', errorDescription);
      
      if (error) {
        console.error('❌ OAuth Error:', error, errorDescription);
        
        // Store error for display
        localStorage.setItem('google_oauth_error', JSON.stringify({
          error,
          errorDescription,
          timestamp: Date.now()
        }));
        
        // Show user-friendly error message
        if (error === 'access_denied') {
          alert('Google authentication was cancelled. Please try again.');
        } else {
          alert(`Google authentication failed: ${errorDescription || error}\n\nThis might be due to:\n• OAuth consent screen not properly configured\n• Missing test users (if in testing mode)\n• Incorrect redirect URIs in Google Cloud Console`);
        }
        return;
      }
      
      if (accessToken) {
        this.accessToken = accessToken;
        localStorage.setItem('google_access_token', accessToken);
        
        // Clear any previous errors
        localStorage.removeItem('google_oauth_error');
        
        // Clean up the URL hash
        window.history.replaceState({}, document.title, window.location.pathname);
        
        console.log('✅ OAuth callback successful - token stored');
      }
    }
    
    // Check if we're coming back from a failed OAuth attempt (no hash, but could be 403)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('error') || window.location.pathname.includes('error')) {
      console.error('❌ Possible OAuth 403/error redirect detected');
      console.log('  - Current URL:', window.location.href);
      console.log('  - Search params:', window.location.search);
      
      alert('Google returned an error (possibly 403). This usually means:\n\n• Your email is not added as a test user in Google Cloud Console\n• The OAuth consent screen is in "Testing" mode\n• The Google Drive API is not enabled\n• Incorrect redirect URIs are configured\n\nPlease check your Google Cloud Console settings.');
    }
  }

  async authenticate(): Promise<void> {
    console.log('🚀 === STARTING GOOGLE OAUTH AUTHENTICATION ===');
    console.log('📱 Environment Details:');
    console.log('  - Current Domain:', window.location.origin);
    console.log('  - Current URL:', window.location.href);
    console.log('  - User Agent:', navigator.userAgent);
    console.log('  - Browser:', navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Other');
    
    // Use the current app URL as redirect URI
    const redirectUri = window.location.origin;
    
    console.log('🔧 OAuth Configuration:');
    console.log('  - Client ID:', this.clientId);
    console.log('  - Redirect URI:', redirectUri);
    console.log('  - Scopes: drive + drive.file');
    console.log('  - Response Type: token (implicit flow)');
    
    // Check if this domain might be causing issues
    if (redirectUri.includes('lovableproject.com')) {
      console.log('⚠️  Using Lovable preview domain - checking if this is configured in Google Cloud Console...');
    }
    
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      `client_id=${this.clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file')}&` +
      `prompt=select_account&` +
      `include_granted_scopes=true`;
    
    console.log('🌐 Complete OAuth URL:', authUrl);
    console.log('🔍 URL Breakdown:');
    console.log('  - Base: https://accounts.google.com/o/oauth2/v2/auth');
    console.log('  - client_id:', this.clientId);
    console.log('  - redirect_uri:', redirectUri);
    console.log('  - response_type: token');
    console.log('  - scope: https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file');
    console.log('  - prompt: select_account');
    console.log('  - include_granted_scopes: true');
    
    console.log('🚀 Redirecting to Google in 2 seconds...');
    console.log('📝 If you get a 403 error, check these in Google Cloud Console:');
    console.log('  1. OAuth consent screen status (Testing vs Production)');
    console.log('  2. Test users added (if in Testing mode)');
    console.log('  3. Authorized redirect URIs include:', redirectUri);
    console.log('  4. Google Drive API is enabled');
    console.log('  5. OAuth 2.0 Client ID is active');
    
    // Add delay to see logs
    setTimeout(() => {
      console.log('🌐 === REDIRECTING TO GOOGLE NOW ===');
      window.location.href = authUrl;
    }, 2000);
  }

  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authenticated - please call authenticate() first');
    }

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired, clear it
      this.logout();
      throw new Error('Authentication expired - please reconnect to Google Drive');
    }

    return response;
  }

  async listFiles(folderId?: string): Promise<any[]> {
    let query = "mimeType contains 'video/' or mimeType contains 'image/'";
    
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const url = `https://www.googleapis.com/drive/v3/files?` +
      `q=${encodeURIComponent(query)}&` +
      `fields=files(id,name,size,createdTime,thumbnailLink,mimeType,videoMediaMetadata,imageMediaMetadata,webViewLink)&` +
      `pageSize=1000`;

    console.log('📁 Fetching files with query:', query);

    const response = await this.makeAuthenticatedRequest(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch files: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log('📊 Found files:', data.files?.length || 0);
    
    // Transform the data to match expected format
    return (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      size: parseInt(file.size) || 0,
      sizeFormatted: this.formatFileSize(parseInt(file.size) || 0),
      createdTime: file.createdTime,
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
      metadata: {
        video: file.videoMediaMetadata,
        image: file.imageMediaMetadata
      }
    }));
  }

  async downloadFile(fileId: string): Promise<string> {
    // For Google Drive, we can use the direct download URL
    return `https://drive.google.com/uc?id=${fileId}&export=download`;
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
    localStorage.removeItem('google_access_token');
    console.log('🚪 Logged out - token cleared');
  }
}

// Export singleton instance
export const fixedGoogleOAuth = new FixedGoogleOAuth();