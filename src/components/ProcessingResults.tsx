import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Download, 
  Folder, 
  FileText, 
  Clock, 
  CheckCircle, 
  FolderOpen,
  Film
} from 'lucide-react';

interface ProcessingResults {
  downloadedVideos: ProcessedVideo[];
  organizationStructure: FolderStructure;
  projectFiles: ProjectFile[];
  totalTime: string;
}

interface ProcessedVideo {
  id: string;
  originalName: string;
  newName: string;
  originalDate: Date;
  localPath: string;
  metadata: VideoMetadata;
}

interface VideoMetadata {
  duration: number;
  resolution: string;
  fps: number;
  codec: string;
  bitrate: number;
  fileSize: number;
}

interface FolderStructure {
  rootPath: string;
  folders: Array<{
    name: string;
    path: string;
    videoCount: number;
  }>;
}

interface ProjectFile {
  type: 'capcut' | 'premiere';
  name: string;
  path: string;
  videoCount: number;
}

interface ProcessingResultsProps {
  results: ProcessingResults;
  onStartNew: () => void;
}

const ProcessingResults: React.FC<ProcessingResultsProps> = ({ results, onStartNew }) => {
  const totalVideos = results.downloadedVideos.length;
  const totalSize = results.downloadedVideos.reduce((sum, v) => sum + v.metadata.fileSize, 0);
  const totalDuration = results.downloadedVideos.reduce((sum, v) => sum + v.metadata.duration, 0);

  const downloadProjectFile = (projectFile: ProjectFile) => {
    // In a real implementation, this would trigger a download
    // For now, we'll just show a toast
    alert(`Downloading ${projectFile.name}...`);
  };

  const openFolder = (folderPath: string) => {
    // In a real implementation, this would open the folder in file explorer
    alert(`Opening folder: ${folderPath}`);
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Processing Complete
            <Badge variant="default" className="ml-auto">
              {totalVideos} videos processed
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{totalVideos}</div>
              <div className="text-sm text-muted-foreground">Videos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
              <div className="text-sm text-muted-foreground">Total Size</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatDuration(totalDuration)}</div>
              <div className="text-sm text-muted-foreground">Total Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{results.totalTime}</div>
              <div className="text-sm text-muted-foreground">Processing Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Folder Structure */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Organization Structure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen className="h-4 w-4" />
              Root: {results.organizationStructure.rootPath}
            </div>
            
            <div className="space-y-2">
              {results.organizationStructure.folders.map((folder, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Folder className="h-4 w-4" />
                    <span className="font-medium">{folder.name}</span>
                    <Badge variant="secondary">{folder.videoCount} videos</Badge>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => openFolder(folder.path)}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project Files */}
      {results.projectFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Film className="h-5 w-5" />
              Generated Project Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.projectFiles.map((projectFile, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5" />
                    <div>
                      <div className="font-medium">{projectFile.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {projectFile.type === 'capcut' ? 'CapCut' : 'Premiere Pro'} project • {projectFile.videoCount} videos
                      </div>
                    </div>
                  </div>
                  <Button 
                    onClick={() => downloadProjectFile(projectFile)}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processed Videos List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Processed Videos
            <Badge variant="secondary" className="ml-auto">
              {totalVideos} files
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {results.downloadedVideos.map((video, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-md text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{video.newName}</div>
                  <div className="text-muted-foreground text-xs">
                    {video.originalName} • {formatBytes(video.metadata.fileSize)} • {formatDuration(video.metadata.duration * 1000)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground ml-4">
                  {video.originalDate.toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={onStartNew} variant="outline" className="flex-1">
          Process More Videos
        </Button>
        <Button className="flex-1">
          Open Downloads Folder
        </Button>
      </div>
    </div>
  );
};

// Utility functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export default ProcessingResults;