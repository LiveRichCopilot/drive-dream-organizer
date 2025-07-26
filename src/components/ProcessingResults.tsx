import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Upload, 
  Play,
  Pause,
  RotateCcw,
  Download,
  FolderOpen
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProcessedVideo {
  id: string;
  originalName: string;
  newName: string;
  originalDate: string;
  localPath: string;
  metadata: any;
  selected?: boolean;
  uploadStatus?: 'pending' | 'uploading' | 'completed' | 'failed';
  uploadError?: string;
  newId?: string;
  uploadedPath?: string;
}

interface ProcessingResultsProps {
  results: {
    processedVideos: ProcessedVideo[];
    statistics: any;
    organizationStructure: any;
    settings: any;
  };
  sourceFolderId?: string;
  onClose: () => void;
}

export const ProcessingResults: React.FC<ProcessingResultsProps> = ({
  results,
  sourceFolderId,
  onClose
}) => {
  const { toast } = useToast();
  const [videos, setVideos] = useState<ProcessedVideo[]>(
    results.processedVideos.map(video => ({
      ...video,
      selected: true,
      uploadStatus: 'pending'
    }))
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [mainFolderId, setMainFolderId] = useState<string>('');
  const [destinationFolderName, setDestinationFolderName] = useState(
    `Organized_Videos_${new Date().toISOString().split('T')[0]}`
  );

  const selectedVideos = videos.filter(v => v.selected);
  const completedUploads = videos.filter(v => v.uploadStatus === 'completed').length;
  const failedUploads = videos.filter(v => v.uploadStatus === 'failed').length;
  const uploadProgress = selectedVideos.length > 0 ? (completedUploads / selectedVideos.length) * 100 : 0;

  const toggleVideoSelection = (videoId: string) => {
    setVideos(prev => prev.map(video => 
      video.id === videoId 
        ? { ...video, selected: !video.selected }
        : video
    ));
  };

  const selectAll = () => {
    setVideos(prev => prev.map(video => ({ ...video, selected: true })));
  };

  const selectNone = () => {
    setVideos(prev => prev.map(video => ({ ...video, selected: false })));
  };

  const resetUploadStatus = () => {
    setVideos(prev => prev.map(video => ({
      ...video,
      uploadStatus: 'pending',
      uploadError: undefined,
      newId: undefined,
      uploadedPath: undefined
    })));
    setCurrentUploadIndex(0);
    setMainFolderId('');
  };

  const uploadSingleVideo = async (video: ProcessedVideo, folderMap: Map<string, string>) => {
    try {
      // Update status to uploading
      setVideos(prev => prev.map(v => 
        v.id === video.id 
          ? { ...v, uploadStatus: 'uploading' }
          : v
      ));

      // Determine target folder
      const originalDate = new Date(video.originalDate);
      const yearMonth = `${originalDate.getFullYear()}/${String(originalDate.getMonth() + 1).padStart(2, '0')}-${originalDate.toLocaleDateString('en', { month: 'long' })}`;
      let targetFolderId = folderMap.get(yearMonth);
      
      // Create subfolder if it doesn't exist
      if (!targetFolderId) {
        const response = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('google_access_token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: yearMonth,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [mainFolderId]
          })
        });

        if (response.ok) {
          const folder = await response.json();
          folderMap.set(yearMonth, folder.id);
          targetFolderId = folder.id;
        } else {
          targetFolderId = mainFolderId; // Fallback to main folder
        }
      }

      // Copy video to target folder
      const copyResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${video.id}/copy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('google_access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: video.newName,
          parents: [targetFolderId],
          description: `Organized video - Original: ${video.originalName}, Created: ${video.originalDate}`
        })
      });

      if (!copyResponse.ok) {
        throw new Error(`Failed to copy video: ${copyResponse.statusText}`);
      }

      const copiedFile = await copyResponse.json();

      // Update status to completed
      setVideos(prev => prev.map(v => 
        v.id === video.id 
          ? { 
              ...v, 
              uploadStatus: 'completed',
              newId: copiedFile.id,
              uploadedPath: `${destinationFolderName}/${yearMonth}/${video.newName}`
            }
          : v
      ));

      return { success: true };
    } catch (error: any) {
      // Update status to failed
      setVideos(prev => prev.map(v => 
        v.id === video.id 
          ? { 
              ...v, 
              uploadStatus: 'failed',
              uploadError: error.message
            }
          : v
      ));
      
      return { success: false, error: error.message };
    }
  };

  const startUpload = async () => {
    if (selectedVideos.length === 0) {
      toast({
        title: "No videos selected",
        description: "Please select at least one video to upload.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setIsPaused(false);

    try {
      // Create main folder if not exists
      if (!mainFolderId) {
        const parentFolderId = sourceFolderId || null;
        const mainFolderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('google_access_token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: destinationFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentFolderId ? [parentFolderId] : undefined
          })
        });

        if (!mainFolderResponse.ok) {
          const errorText = await mainFolderResponse.text();
          throw new Error(`Failed to create main folder: ${mainFolderResponse.status} ${errorText}`);
        }

        const mainFolder = await mainFolderResponse.json();
        setMainFolderId(mainFolder.id);
      }

      // Create folder map
      const folderMap = new Map();
      folderMap.set('root', mainFolderId);

      // Process each selected video individually
      const videosToUpload = selectedVideos.filter(v => v.uploadStatus !== 'completed');
      
      for (let i = 0; i < videosToUpload.length; i++) {
        if (isPaused) break;

        setCurrentUploadIndex(i);
        const video = videosToUpload[i];
        
        await uploadSingleVideo(video, folderMap);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!isPaused) {
        toast({
          title: "Upload completed!",
          description: `Successfully uploaded ${completedUploads} videos.`,
        });
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const pauseUpload = () => {
    setIsPaused(true);
    setIsUploading(false);
  };

  const resumeUpload = () => {
    setIsPaused(false);
    startUpload();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'uploading':
        return <Upload className="h-4 w-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Upload Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload to Google Drive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <label htmlFor="folder-name" className="text-sm font-medium">
              Destination Folder:
            </label>
            <input
              id="folder-name"
              type="text"
              value={destinationFolderName}
              onChange={(e) => setDestinationFolderName(e.target.value)}
              className="flex-1 px-3 py-1 text-sm border rounded"
              disabled={isUploading}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={selectAll}
              disabled={isUploading}
            >
              Select All
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={selectNone}
              disabled={isUploading}
            >
              Select None
            </Button>
            <div className="flex-1" />
            <Badge variant="outline">
              {selectedVideos.length} of {videos.length} selected
            </Badge>
          </div>

          {uploadProgress > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Upload Progress</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{completedUploads} completed</span>
                <span>{failedUploads} failed</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {!isUploading && !isPaused && (
              <Button onClick={startUpload} disabled={selectedVideos.length === 0}>
                <Upload className="h-4 w-4 mr-2" />
                Start Upload
              </Button>
            )}
            
            {isUploading && (
              <Button onClick={pauseUpload} variant="outline">
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            
            {isPaused && (
              <Button onClick={resumeUpload}>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}

            <Button onClick={resetUploadStatus} variant="outline" disabled={isUploading}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>

            {mainFolderId && (
              <Button 
                variant="outline"
                onClick={() => window.open(`https://drive.google.com/drive/folders/${mainFolderId}`, '_blank')}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                View Folder
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Video List */}
      <Card>
        <CardHeader>
          <CardTitle>Processed Videos ({videos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50"
              >
                <Checkbox
                  checked={video.selected}
                  onCheckedChange={() => toggleVideoSelection(video.id)}
                  disabled={isUploading}
                />
                
                {getStatusIcon(video.uploadStatus || 'pending')}
                
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{video.newName}</div>
                  <div className="text-sm text-gray-500 truncate">
                    {video.originalName}
                  </div>
                  {video.uploadError && (
                    <div className="text-xs text-red-500 truncate">
                      Error: {video.uploadError}
                    </div>
                  )}
                </div>
                
                <div className="text-sm text-gray-500">
                  {formatFileSize(video.metadata?.fileSize || 0)}
                </div>
                
                <Badge 
                  variant={
                    video.uploadStatus === 'completed' ? 'default' :
                    video.uploadStatus === 'failed' ? 'destructive' :
                    video.uploadStatus === 'uploading' ? 'secondary' : 'outline'
                  }
                >
                  {video.uploadStatus || 'pending'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProcessingResults;