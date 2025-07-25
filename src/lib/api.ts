import { toast } from "@/hooks/use-toast";

const API_BASE_URL = 'https://liverich-backend-1083445308449.us-central1.run.app';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
  thumbnailLink?: string;
  videoMediaMetadata?: {
    width: number;
    height: number;
    durationMillis: string;
  };
}

export interface VideoFile {
  id: string;
  name: string;
  duration: string;
  size: string;
  dateCreated: string;
  thumbnail: string;
  format: string;
  webViewLink: string;
  downloadUrl?: string;
}

class APIClient {
  private accessToken: string | null = null;

  constructor() {
    // Check for stored access token
    this.accessToken = localStorage.getItem('google_access_token');
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.accessToken && { 'Authorization': `Bearer ${this.accessToken}` }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    try {
      const response = await this.request('/auth/google');
      const { authUrl } = response;
      
      // Open popup for Google OAuth
      return new Promise((resolve, reject) => {
        const popup = window.open(
          authUrl,
          'google-auth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            reject(new Error('Authentication was cancelled'));
          }
        }, 1000);

        // Listen for the access token from the popup
        const messageHandler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageHandler);
            popup?.close();
            
            this.accessToken = event.data.accessToken;
            localStorage.setItem('google_access_token', this.accessToken!);
            resolve(this.accessToken!);
          } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageHandler);
            popup?.close();
            reject(new Error(event.data.error));
          }
        };

        window.addEventListener('message', messageHandler);
      });
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  async listVideoFiles(): Promise<VideoFile[]> {
    try {
      const response = await this.request('/files/videos');
      const files: DriveFile[] = response.files;
      
      return files.map(file => this.transformDriveFileToVideoFile(file));
    } catch (error) {
      console.error('Failed to list video files:', error);
      toast({
        title: "Error",
        description: "Failed to load videos from Google Drive",
        variant: "destructive",
      });
      return [];
    }
  }

  async downloadFile(fileId: string, fileName: string): Promise<string> {
    try {
      const response = await this.request(`/files/${fileId}/download`);
      return response.downloadUrl;
    } catch (error) {
      console.error('Failed to get download URL:', error);
      throw error;
    }
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    try {
      await this.request(`/files/${fileId}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName }),
      });
      
      toast({
        title: "Success",
        description: `File renamed to "${newName}"`,
      });
    } catch (error) {
      console.error('Failed to rename file:', error);
      toast({
        title: "Error",
        description: "Failed to rename file",
        variant: "destructive",
      });
      throw error;
    }
  }

  async organizeVideosByDate(fileIds: string[]): Promise<void> {
    try {
      await this.request('/files/organize-by-date', {
        method: 'POST',
        body: JSON.stringify({ fileIds }),
      });
      
      toast({
        title: "Success",
        description: "Videos organized chronologically",
      });
    } catch (error) {
      console.error('Failed to organize videos:', error);
      toast({
        title: "Error",
        description: "Failed to organize videos",
        variant: "destructive",
      });
      throw error;
    }
  }

  private transformDriveFileToVideoFile(file: DriveFile): VideoFile {
    const formatMap: Record<string, string> = {
      'video/mp4': 'MP4',
      'video/quicktime': 'MOV',
      'video/x-msvideo': 'AVI',
      'video/webm': 'WEBM',
    };

    const format = formatMap[file.mimeType] || 'VIDEO';
    const sizeInBytes = parseInt(file.size);
    const sizeFormatted = this.formatFileSize(sizeInBytes);
    
    const duration = file.videoMediaMetadata?.durationMillis 
      ? this.formatDuration(parseInt(file.videoMediaMetadata.durationMillis))
      : 'Unknown';

    return {
      id: file.id,
      name: file.name,
      duration,
      size: sizeFormatted,
      dateCreated: new Date(file.createdTime).toLocaleDateString(),
      thumbnail: file.thumbnailLink || '/api/placeholder/300/200',
      format,
      webViewLink: file.webViewLink,
    };
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
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