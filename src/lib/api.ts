import { tokenManager, AuthError, NetworkError } from './auth/TokenManager';

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  thumbnailLink?: string;
  mimeType: string;
  fileExtension?: string;
  videoMediaMetadata?: {
    durationMillis: string;
  };
  imageMediaMetadata?: {
    width: number;
    height: number;
    time?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface MediaFile {
  id: string;
  name: string;
  size: number;
  sizeFormatted: string;
  createdTime: string;
  thumbnailLink?: string;
  duration?: number;
  durationFormatted?: string;
  thumbnail: string;
  format: string;
  dateCreated: string;
  webViewLink: string;
  mimeType: string;
  fileType: 'video' | 'image' | 'other';
  metadata?: any;
}

// Legacy type alias for backward compatibility
export type VideoFile = MediaFile;

class APIClient {
  private baseURL = 'https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1';

  async authenticate(): Promise<void> {
    // This method is deprecated - use fixedGoogleOAuth instead
    throw new Error('Please use the fixedGoogleOAuth authentication method instead');
  }

  async listMediaFiles(folderId?: string): Promise<MediaFile[]> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/google-drive-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folderId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to fetch media files (${response.status})`;
        
        if (response.status === 401) {
          throw new AuthError('Authentication expired - please reconnect to Google Drive');
        }
        throw new NetworkError(errorMessage, response.status);
      }
      
      const data = await response.json();
      console.log('API Response data:', data);
      console.log('Files found:', data.files?.length || 0);
      
      // Show skip message if certain files were filtered out
      if (data.message) {
        console.log(data.message);
        (window as any).lastSkipMessage = data.message;
      }
      
      return data.files || [];
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError('Failed to fetch media files');
    }
  }

  // Legacy method for backward compatibility
  async listVideoFiles(folderId?: string): Promise<MediaFile[]> {
    const allFiles = await this.listMediaFiles(folderId);
    return allFiles.filter(file => file.fileType === 'video');
  }

  async downloadFile(fileId: string, fileName: string): Promise<string> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/google-drive-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  async organizeFilesByDate(
    fileIds: string[], 
    sourceFolderId?: string, 
    existingFolders?: any
  ): Promise<any> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/google-drive-organize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileIds, sourceFolderId, existingFolders }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthError('Authentication expired - please reconnect to Google Drive');
        }
        throw new NetworkError('Failed to organize files', response.status);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError('Failed to organize files');
    }
  }

  // Legacy method for backward compatibility
  async organizeVideosByDate(
    fileIds: string[], 
    sourceFolderId?: string, 
    existingFolders?: any
  ): Promise<any> {
    return this.organizeFilesByDate(fileIds, sourceFolderId, existingFolders);
  }

  async extractMediaMetadata(fileId: string): Promise<any> {
    try {
      const response = await tokenManager.makeAuthenticatedRequest(`${this.baseURL}/video-metadata-extractor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      throw new NetworkError('Failed to extract media metadata');
    }
  }

  // Legacy method for backward compatibility
  async extractVideoMetadata(fileId: string): Promise<any> {
    return this.extractMediaMetadata(fileId);
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