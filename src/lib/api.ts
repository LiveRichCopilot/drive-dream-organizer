export interface DriveFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  thumbnailLink?: string;
  videoMediaMetadata?: {
    durationMillis: string;
  };
}

export interface VideoFile {
  id: string;
  name: string;
  size: number;
  sizeFormatted: string;
  createdTime: string;
  thumbnailLink?: string;
  duration: number;
  durationFormatted: string;
  thumbnail: string;
  format: string;
  dateCreated: string;
  webViewLink: string;
}

class APIClient {
  private accessToken: string | null = null;
  private baseURL = 'https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1';

  constructor() {
    // Check for existing token in localStorage
    this.accessToken = localStorage.getItem('google_access_token');
  }

  async authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const clientId = '1016569929536-p16jh5kdbf7m2p48q6enh7p36tvhiefm.apps.googleusercontent.com';
      const scope = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
      const responseType = 'code';
      const redirectUri = `${window.location.origin}/auth/callback`;
      console.log('Using redirect URI:', redirectUri); // Debug log
      
      const authUrl = `https://accounts.google.com/oauth2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=${responseType}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=select_account&` +  // This forces account selection
        `include_granted_scopes=true`;

      const popup = window.open(authUrl, 'google-auth', 'width=500,height=600');
      
      const messageHandler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          window.removeEventListener('message', messageHandler);
          
          try {
            // The callback now receives the authorization code, not access token
            const code = event.data.accessToken; // This is actually the auth code
            
            // Exchange code for token via our Edge Function
            const response = await fetch(`${this.baseURL}/google-auth`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`,
              },
              body: JSON.stringify({ code }),
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to exchange code for token');
            }
            
            const data = await response.json();
            this.accessToken = data.access_token;
            localStorage.setItem('google_access_token', this.accessToken!);
            resolve();
          } catch (error) {
            reject(error);
          }
        } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
          window.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error));
        }
      };

      window.addEventListener('message', messageHandler);
      
      // Handle popup closed without completion
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          reject(new Error('Authentication popup was closed'));
        }
      }, 1000);
    });
  }

  async listVideoFiles(): Promise<VideoFile[]> {
    const response = await fetch(`${this.baseURL}/google-drive-list`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch video files');
    }
    
    const data = await response.json();
    return data.files;
  }

  async downloadFile(fileId: string, fileName: string): Promise<string> {
    const response = await fetch(`${this.baseURL}/google-drive-download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
      },
      body: JSON.stringify({ fileId }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to get download URL');
    }
    
    const data = await response.json();
    return data.downloadUrl;
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/google-drive-rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
      },
      body: JSON.stringify({ fileId, newName }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to rename file');
    }
  }

  async organizeVideosByDate(fileIds: string[]): Promise<void> {
    const response = await fetch(`${this.baseURL}/google-drive-organize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
      },
      body: JSON.stringify({ fileIds }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to organize files');
    }
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  logout(): void {
    this.accessToken = null;
    localStorage.removeItem('google_access_token');
  }
}

export const apiClient = new APIClient();