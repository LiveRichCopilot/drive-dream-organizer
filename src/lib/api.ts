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
    try {
      // First get the client ID from our backend
      const configResponse = await fetch(`${this.baseURL}/google-auth`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`,
        },
      });
      
      if (!configResponse.ok) {
        const errorText = await configResponse.text();
        throw new Error(`Failed to get Google client configuration: ${errorText}`);
      }
      
      const { client_id } = await configResponse.json();
      
      if (!client_id) {
        throw new Error('Google Client ID not configured. Please check your Supabase secrets.');
      }
      
      return new Promise((resolve, reject) => {
        const clientId = client_id;
        const scope = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
        const responseType = 'code';
        const redirectUri = `${window.location.origin}/auth/callback`;
        console.log('Using redirect URI:', redirectUri);
        console.log('Using client ID:', clientId);
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${clientId}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=${responseType}&` +
          `scope=${encodeURIComponent(scope)}&` +
          `access_type=offline&` +
          `prompt=select_account&` +  // This forces account selection
          `include_granted_scopes=true`;

        console.log('Full auth URL:', authUrl);
        
        const popup = window.open(authUrl, 'google-auth', 'width=500,height=600');
        
        if (!popup) {
          reject(new Error('Failed to open authentication popup. Please allow popups for this site.'));
          return;
        }
      
      const messageHandler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          window.removeEventListener('message', messageHandler);
          
          try {
            // The callback now receives the authorization code
            const code = event.data.code;
            
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
              const errorData = await response.json().catch(() => ({}));
              const errorMessage = errorData.error || `Authentication failed (${response.status})`;
              throw new Error(errorMessage);
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
    } catch (error) {
      console.error('Authentication error:', error);
      throw error instanceof Error ? error : new Error('Authentication failed');
    }
  }

  async listVideoFiles(folderId?: string): Promise<VideoFile[]> {
    const response = await fetch(`${this.baseURL}/google-drive-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
      },
      body: JSON.stringify({ folderId }),
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

  async extractVideoMetadata(fileId: string): Promise<any> {
    const response = await fetch(`${this.baseURL}/video-metadata-extractor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
      },
      body: JSON.stringify({ fileId }),
    });

    if (!response.ok) {
      throw new Error('Failed to extract metadata');
    }

    return response.json();
  }

  async generateProjectFiles(videos: any[], settings: any): Promise<any> {
    const response = await fetch(`${this.baseURL}/project-file-generator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
      },
      body: JSON.stringify({ videos, settings }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate project files');
    }

    return response.json();
  }

  async batchProcessVideos(videoIds: string[], onProgress?: (progress: number) => void): Promise<any[]> {
    const results = [];
    const total = videoIds.length;

    for (let i = 0; i < total; i++) {
      const videoId = videoIds[i];
      
      try {
        const metadata = await this.extractVideoMetadata(videoId);
        results.push(metadata);
        
        if (onProgress) {
          onProgress((i + 1) / total * 100);
        }
      } catch (error) {
        console.error(`Failed to process video ${videoId}:`, error);
        results.push({ id: videoId, error: error.message });
      }
    }

    return results;
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