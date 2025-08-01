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
  Film,
  Brain,
  Sparkles,
  Eye,
  Copy
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
  aiAnalysis?: {
    description?: string;
    detailedDescription?: string;
    veo3Prompts?: {
      professional?: string;
      creative?: string;
      technical?: string;
      short?: string;
      detailed?: string;
    };
    scenes?: string[];
    visualStyle?: string;
    subjects?: string[];
    confidence?: number;
  };
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
  const videosWithAI = results.downloadedVideos.filter(v => v.metadata.aiAnalysis);
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // In a real app, you'd show a toast here
    alert('Copied to clipboard!');
  };

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

      {/* AI Analysis Results */}
      {videosWithAI.length > 0 && (
        <Card className="border-gradient-to-r from-purple-500/20 to-cyan-500/20 bg-gradient-to-r from-purple-50/5 to-cyan-50/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-400" />
              AI Video Analysis
              <Badge variant="secondary" className="ml-auto bg-purple-100/10 text-purple-300">
                {videosWithAI.length} videos analyzed
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {videosWithAI.map((video, index) => (
                <div key={index} className="space-y-4 p-4 bg-gradient-to-r from-purple-50/5 to-cyan-50/5 rounded-lg border border-white/10">
                  <div className="flex items-center gap-3">
                    <Eye className="h-5 w-5 text-cyan-400" />
                    <div className="flex-1">
                      <h3 className="font-medium text-white">{video.newName}</h3>
                      <p className="text-xs text-muted-foreground">{video.originalName}</p>
                    </div>
                    {video.metadata.aiAnalysis?.confidence && (
                      <Badge variant="outline" className="text-green-300 border-green-300/30">
                        {Math.round(video.metadata.aiAnalysis.confidence * 100)}% confidence
                      </Badge>
                    )}
                  </div>

                  {/* Description */}
                  {video.metadata.aiAnalysis?.description && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm text-purple-300 flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        AI Description
                      </h4>
                      <div className="relative">
                        <p className="text-sm text-white/90 bg-black/20 p-3 rounded border border-white/10">
                          {video.metadata.aiAnalysis.description}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 h-6 w-6 p-0"
                          onClick={() => copyToClipboard(video.metadata.aiAnalysis?.description || '')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* VEO 3 Prompts */}
                  {video.metadata.aiAnalysis?.veo3Prompts && Object.keys(video.metadata.aiAnalysis.veo3Prompts).length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-cyan-300 flex items-center gap-2">
                        <Film className="h-4 w-4" />
                        VEO 3 Generation Prompts
                      </h4>
                      <div className="grid gap-3">
                        {Object.entries(video.metadata.aiAnalysis.veo3Prompts).map(([type, prompt]) => (
                          prompt && (
                            <div key={type} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {type}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => copyToClipboard(prompt)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              <p className="text-xs text-white/80 bg-black/20 p-2 rounded border border-white/10">
                                {prompt}
                              </p>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Additional Analysis Data */}
                  {(video.metadata.aiAnalysis?.scenes || video.metadata.aiAnalysis?.subjects || video.metadata.aiAnalysis?.visualStyle) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      {video.metadata.aiAnalysis.scenes && (
                        <div>
                          <h5 className="font-medium text-purple-300 mb-1">Scenes</h5>
                          <div className="space-y-1">
                            {video.metadata.aiAnalysis.scenes.map((scene, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {scene}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {video.metadata.aiAnalysis.subjects && (
                        <div>
                          <h5 className="font-medium text-cyan-300 mb-1">Subjects</h5>
                          <div className="space-y-1">
                            {video.metadata.aiAnalysis.subjects.map((subject, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {subject}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {video.metadata.aiAnalysis.visualStyle && (
                        <div>
                          <h5 className="font-medium text-green-300 mb-1">Visual Style</h5>
                          <Badge variant="secondary" className="text-xs">
                            {video.metadata.aiAnalysis.visualStyle}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                    variant="glass"
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
        <Button onClick={onStartNew} variant="glass" className="flex-1">
          Process More Videos
        </Button>
        <Button variant="glass" className="flex-1">
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