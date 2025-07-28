// Direct Google Drive integration without Supabase functions

// Extend Window interface for OAuth callbacks
declare global {
  interface Window {
    googleAuthResolve?: (value: void | PromiseLike<void>) => void;
    googleAuthReject?: (reason?: any) => void;
  }
}

export class DirectGoogleDriveClient {
  private clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1070421026009-ihbdicu5n4b198qi8uoav1b284fefdcd.apps.googleusercontent.com';
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  
  constructor() {
    // Load existing tokens from localStorage
    this.accessToken = localStorage.getItem('google_access_token');
    this.refreshToken = localStorage.getItem('google_refresh_token');
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  async authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if we're already in the redirect flow
      if (window.location.hash.includes('access_token=')) {
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = urlParams.get('access_token');
        
        if (accessToken) {
          this.accessToken = accessToken;
          localStorage.setItem('google_access_token', accessToken);
          
          // Clean up the URL hash
          window.history.replaceState({}, document.title, window.location.pathname);
          resolve();
          return;
        }
      }

      const scope = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly';
      const responseType = 'token'; // Use implicit flow for client-side
      const redirectUri = window.location.origin;
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${this.clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=${responseType}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `prompt=select_account&` +
        `include_granted_scopes=true`;

      // Store the resolve/reject functions for the redirect callback
      window.googleAuthResolve = resolve;
      window.googleAuthReject = reject;

      // Redirect directly instead of using popup
      window.location.href = authUrl;
    });
  }

  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
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
      throw new Error(`Failed to fetch files: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform the data to match our expected format
    return data.files.map((file: any) => ({
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
    this.refreshToken = null;
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_refresh_token');
  }
}

export const directGoogleDrive = new DirectGoogleDriveClient();

// Handle OAuth redirect on page load
if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
  const urlParams = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = urlParams.get('access_token');
  
  if (accessToken) {
    // Store the token
    localStorage.setItem('google_access_token', accessToken);
    
    // Clean up the URL hash
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // If there's a pending promise, resolve it
    if (window.googleAuthResolve) {
      window.googleAuthResolve();
      delete window.googleAuthResolve;
      delete window.googleAuthReject;
    }
  }
}