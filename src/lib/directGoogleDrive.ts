// Direct Google Drive integration without Supabase functions
export class DirectGoogleDriveClient {
  private clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com'; // Replace with your actual Google Client ID
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
      const scope = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly';
      const responseType = 'token'; // Use implicit flow for client-side
      const redirectUri = window.location.origin;
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${this.clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=${responseType}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `include_granted_scopes=true`;

      const popup = window.open(authUrl, 'google-auth', 'width=500,height=600');
      
      if (!popup) {
        reject(new Error('Failed to open authentication popup. Please allow popups for this site.'));
        return;
      }

      // Check for the access token in the popup URL
      const checkForToken = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(checkForToken);
            reject(new Error('Authentication popup was closed'));
            return;
          }

          const popupUrl = popup.location.href;
          if (popupUrl.includes('access_token=')) {
            const urlParams = new URLSearchParams(popupUrl.split('#')[1]);
            const accessToken = urlParams.get('access_token');
            
            if (accessToken) {
              this.accessToken = accessToken;
              localStorage.setItem('google_access_token', accessToken);
              
              popup.close();
              clearInterval(checkForToken);
              resolve();
            }
          }
        } catch (e) {
          // Cross-origin error when popup is on google.com - this is normal
          // We'll continue checking until the popup returns to our domain
        }
      }, 1000);
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