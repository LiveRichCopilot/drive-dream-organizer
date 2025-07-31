
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
  extractionMethod?: string;
  extractionStatus?: 'success' | 'failed' | 'partial';
  // Google Vision analysis fields
  description?: string;
  videoType?: string;
  labels?: Array<{
    description: string;
    score: number;
    confidence: number;
  }>;
  objects?: Array<{
    name: string;
    score: number;
    confidence: number;
  }>;
  colors?: Array<{
    red: number;
    green: number;
    blue: number;
    score: number;
  }>;
  analysisConfidence?: number;
}

export class GoogleDriveMetadataExtractor {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async extractMetadata(fileId: string, fileName?: string): Promise<VideoMetadata> {
    const strategies = [
      () => this.extractWithDeepParsing(fileId, fileName),
      () => this.extractFromGoogleDriveApi(fileId),
      () => this.extractFromFileName(fileId, fileName),
      () => this.inferFromSequence(fileId),
    ];

    let metadata: VideoMetadata = {};
    let extractionMethod = 'none';

    for (const strategy of strategies) {
      try {
        console.log(`🎯 Trying extraction strategy: ${strategy.name || 'unknown'} for ${fileName || fileId}`);
        const result = await strategy();
        metadata = { ...metadata, ...result };
        
        console.log(`📋 Strategy result:`, result);
        
        // If we have an original date, that's our main goal
        if (metadata.originalDate) {
          extractionMethod = strategy.name || 'unknown';
          console.log(`✅ Found original date with ${extractionMethod}: ${metadata.originalDate}`);
          break;
        }
      } catch (error) {
        console.warn(`❌ Metadata extraction strategy ${strategy.name || 'unknown'} failed:`, error);
        // Continue to next strategy
      }
    }

    // After metadata extraction, analyze video content with Google Vision
    try {
      console.log(`🎬 Starting video content analysis for ${fileName || fileId}...`);
      const analysisResult = await this.analyzeVideoContent(fileId, fileName);
      if (analysisResult.success) {
        metadata.description = analysisResult.analysis.description;
        metadata.videoType = analysisResult.analysis.videoType;
        metadata.labels = analysisResult.analysis.labels;
        metadata.objects = analysisResult.analysis.objects;
        metadata.colors = analysisResult.analysis.colors;
        metadata.analysisConfidence = analysisResult.analysis.confidence;
        console.log(`✅ Video analysis complete: ${analysisResult.analysis.description}`);
      }
    } catch (error) {
      console.warn(`⚠️ Video analysis failed for ${fileName || fileId}:`, error);
      // Don't fail the entire process if analysis fails
    }

    return {
      ...metadata,
      extractionMethod,
      extractionStatus: metadata.originalDate ? 'success' : 'failed'
    };
  }

  private async extractWithDeepParsing(fileId: string, fileName?: string): Promise<VideoMetadata> {
    try {
      console.log(`🔍 Starting deep parsing for ${fileName || fileId}...`);
      
      const response = await fetch('https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1/video-metadata-deep-extract', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          fileId, 
          fileName,
          accessToken: this.accessToken 
        }),
      });

      console.log(`📡 Deep parsing response status: ${response.status} for ${fileName || fileId}`);

      if (!response.ok) {
        throw new Error(`Deep parsing failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.metadata) {
        const metadata: VideoMetadata = {};
        
        if (result.metadata.originalDate) {
          metadata.originalDate = result.metadata.originalDate;
        }
        
        if (result.metadata.location) {
          metadata.location = result.metadata.location;
        }
        
        if (result.metadata.device) {
          metadata.device = result.metadata.device;
        }
        
        if (result.metadata.isEdited) {
          metadata.isEdited = result.metadata.isEdited;
          metadata.editingSoftware = result.metadata.editingSoftware;
        }

        return metadata;
      }
    } catch (error) {
      console.warn('Deep parsing extraction failed:', error);
    }

    return {};
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

  private async extractFromFileName(fileId: string, fileName?: string): Promise<VideoMetadata> {
    const metadata: VideoMetadata = {};
    
    if (!fileName) return metadata;
    
    // iPhone patterns: IMG_1234.MOV, IMG_E1234.MOV (edited)
    if (fileName.match(/IMG_E?\d+\.(MOV|mp4)/i)) {
      metadata.device = 'iPhone';
      if (fileName.includes('IMG_E')) {
        metadata.isEdited = true;
        metadata.editingSoftware = 'iPhone Photos Edit';
      }
    }
    
    // Date patterns in filename: YYYY_MM_DD or YYYY-MM-DD
    const dateMatch = fileName.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})/);
    if (dateMatch) {
      try {
        const [_, year, month, day] = dateMatch;
        metadata.originalDate = new Date(`${year}-${month}-${day}`).toISOString();
      } catch (error) {
        console.warn('Invalid date in filename:', error);
      }
    }
    
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

  private async analyzeVideoContent(fileId: string, fileName?: string): Promise<any> {
    try {
      const response = await fetch('https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1/google-vision-video-analysis', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          fileId, 
          fileName,
          accessToken: this.accessToken 
        }),
      });

      if (!response.ok) {
        throw new Error(`Video analysis failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.warn('Video analysis failed:', error);
      return { success: false, error: error.message };
    }

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
