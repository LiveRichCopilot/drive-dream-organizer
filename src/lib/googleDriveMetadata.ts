
// Google Drive metadata extraction utility
// This handles the complex task of extracting original metadata from video files
// following the patterns shown in Google's documentation

export interface VideoMetadata {
  originalDate?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  device?: string;
  format?: string;
  duration?: number;
  resolution?: {
    width: number;
    height: number;
  };
  editingSoftware?: string;
  isEdited?: boolean;
}

export class GoogleDriveMetadataExtractor {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async extractMetadata(fileId: string): Promise<VideoMetadata> {
    const strategies = [
      () => this.extractFromGoogleDriveApi(fileId),
      () => this.extractFromFileName(fileId),
      () => this.inferFromSequence(fileId),
    ];

    let metadata: VideoMetadata = {};

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        metadata = { ...metadata, ...result };
        
        // If we have an original date, that's our main goal
        if (metadata.originalDate) {
          break;
        }
      } catch (error) {
        console.warn(`Metadata extraction strategy failed: ${error}`);
        // Continue to next strategy
      }
    }

    return metadata;
  }

  private async extractFromGoogleDriveApi(fileId: string): Promise<VideoMetadata> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,createdTime,modifiedTime,videoMediaMetadata,imageMediaMetadata,properties,appProperties`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file metadata: ${response.status}`);
    }

    const data = await response.json();
    const metadata: VideoMetadata = {};

    // Extract from video metadata if available
    if (data.videoMediaMetadata) {
      const videoMeta = data.videoMediaMetadata;
      
      if (videoMeta.durationMillis) {
        metadata.duration = parseInt(videoMeta.durationMillis) / 1000;
      }
      
      if (videoMeta.width && videoMeta.height) {
        metadata.resolution = {
          width: parseInt(videoMeta.width),
          height: parseInt(videoMeta.height),
        };
      }
    }

    // Extract from image metadata if available (for photos)
    if (data.imageMediaMetadata) {
      const imageMeta = data.imageMediaMetadata;
      
      if (imageMeta.time) {
        metadata.originalDate = imageMeta.time;
      }
      
      if (imageMeta.location) {
        metadata.location = {
          latitude: imageMeta.location.latitude,
          longitude: imageMeta.location.longitude,
        };
      }
    }

    // Check for editing software indicators
    metadata.editingSoftware = this.detectEditingSoftware(data.name);
    metadata.isEdited = !!metadata.editingSoftware;

    return metadata;
  }

  private async extractFromFileName(fileId: string): Promise<VideoMetadata> {
    // This would involve getting the file name and parsing it for date patterns
    // Common iPhone patterns: IMG_1234.MOV, IMG_E1234.MOV (edited), etc.
    const metadata: VideoMetadata = {};
    
    // Implementation would analyze filename patterns
    // For now, return empty metadata
    return metadata;
  }

  private async inferFromSequence(fileId: string): Promise<VideoMetadata> {
    // This would involve looking at surrounding files to infer dates
    // Based on sequence numbers, creation patterns, etc.
    const metadata: VideoMetadata = {};
    
    // Implementation would analyze file sequences
    // For now, return empty metadata
    return metadata;
  }

  private detectEditingSoftware(fileName: string): string | undefined {
    const patterns = {
      'CapCut': ['capcut', 'cc_', 'CapCut'],
      'Premiere Pro': ['premiere', 'adobe', '_prproj'],
      'Final Cut Pro': ['fcpx', 'compressor'],
      'DaVinci Resolve': ['resolve', 'dr_'],
      'iMovie': ['imovie'],
      'Generic Edit': ['_edit', '_final', '_export', 'rendered', 'output', 'IMG_E']
    };

    const lowerFileName = fileName.toLowerCase();
    
    for (const [software, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => lowerFileName.includes(keyword.toLowerCase()))) {
        return software;
      }
    }

    return undefined;
  }

  // Static utility methods
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
