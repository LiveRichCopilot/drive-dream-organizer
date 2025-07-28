import { tokenManager, AuthError, NetworkError } from './auth/TokenManager';

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
  private baseURL = 'https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1';

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
        const scope = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly';
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
          `prompt=consent&` +  // Force consent to ensure we get refresh token
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
            
            // Store tokens using the new token manager
            tokenManager.setTokens(data.access_token, data.refresh_token, data.expires_in);
            
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
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/google-drive-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
        },
        body: JSON.stringify({ folderId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to fetch video files (${response.status})`;
        
        if (response.status === 401) {
          throw new AuthError('Authentication expired - please reconnect to Google Drive');
        }
        throw new NetworkError(errorMessage, response.status);
      }
      
      const data = await response.json();
      console.log('API Response data:', data);
      console.log('Files found:', data.files?.length || 0);
      return data.files || [];
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError('Failed to fetch video files');
    }
  }

  async downloadFile(fileId: string, fileName: string): Promise<string> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/google-drive-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
        },
        body: JSON.stringify({ fileId }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthError('Authentication expired - please reconnect to Google Drive');
        }
        throw new NetworkError('Failed to get download URL', response.status);
      }
      
      const data = await response.json();
      return data.downloadUrl;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError('Failed to download file');
    }
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/google-drive-rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
        },
        body: JSON.stringify({ fileId, newName }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthError('Authentication expired - please reconnect to Google Drive');
        }
        throw new NetworkError('Failed to rename file', response.status);
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError('Failed to rename file');
    }
  }

  async organizeVideosByDate(fileIds: string[], sourceFolderId?: string): Promise<void> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/google-drive-organize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
        },
        body: JSON.stringify({ fileIds, sourceFolderId }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthError('Authentication expired - please reconnect to Google Drive');
        }
        throw new NetworkError('Failed to organize files', response.status);
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError('Failed to organize files');
    }
  }

  async extractVideoMetadata(fileId: string): Promise<any> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/video-metadata-extractor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
        },
        body: JSON.stringify({ fileId }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthError('Authentication expired - please reconnect to Google Drive');
        }
        const errorText = await response.text();
        console.error('Metadata extraction error:', response.status, errorText);
        throw new NetworkError(`Failed to extract metadata: ${errorText}`, response.status);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError('Failed to extract video metadata');
    }
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

  async uploadOrganizedVideos(processedVideos: any[], destinationFolderName: string, organizationStructure: any, sourceFolderId?: string, projectFiles?: any[]): Promise<any> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/google-drive-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88',
        },
        body: JSON.stringify({ 
          processedVideos, 
          destinationFolderName,
          organizationStructure,
          sourceFolderId,
          projectFiles
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthError('Authentication expired - please reconnect to Google Drive');
        }
        const errorText = await response.text();
        console.error('Upload error response:', errorText);
        throw new NetworkError(`Failed to upload organized videos: ${response.status} ${errorText}`, response.status);
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError('Failed to upload organized videos');
    }
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
    return tokenManager.isAuthenticated();
  }

  getAccessToken(): string | null {
    return tokenManager.getAccessToken();
  }

  logout(): void {
    tokenManager.logout();
  }
}

export const apiClient = new APIClient();