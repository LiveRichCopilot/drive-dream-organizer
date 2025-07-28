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
      
      if (error) {
        console.error('OAuth Error:', error);
        alert(`Google authentication failed: ${error}`);
        return;
      }
      
      if (accessToken) {
        this.accessToken = accessToken;
        localStorage.setItem('google_access_token', accessToken);
        
        // Clean up the URL hash
        window.history.replaceState({}, document.title, window.location.pathname);
        
        console.log('✅ OAuth successful - token stored');
      }
    }
  }

  async authenticate(): Promise<void> {
    const redirectUri = window.location.origin;
    
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      `client_id=${this.clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file')}&` +
      `prompt=select_account&` +
      `include_granted_scopes=true`;
    
    console.log('🔗 Redirecting to Google OAuth...');
    window.location.href = authUrl;
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

    const response = await this.makeAuthenticatedRequest(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch files: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
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