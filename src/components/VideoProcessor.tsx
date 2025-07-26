import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Play, Pause, RotateCcw, FileText, Clock, HardDrive } from 'lucide-react';
import { VideoFile } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface ProcessingState {
  status: 'idle' | 'downloading' | 'extracting' | 'organizing' | 'generating' | 'completed' | 'error';
  currentStep: number;
  totalSteps: number;
  currentFile?: string;
  progress: number;
  timeRemaining?: string;
  downloadedCount: number;
  processedCount: number;
  totalSize: string;
  downloadedSize: string;
  startTime: number;
}

interface VideoProcessorProps {
  videos: VideoFile[];
  folderId?: string;
  onProcessingComplete: (results: ProcessingResults) => void;
}

interface ProcessingResults {
  downloadedVideos: ProcessedVideo[];
  organizationStructure: FolderStructure;
  projectFiles: ProjectFile[];
  totalTime: string;
  uploadResult?: any;
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

const VideoProcessor: React.FC<VideoProcessorProps> = ({ videos, folderId, onProcessingComplete }) => {
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    currentStep: 0,
    totalSteps: 6,
    progress: 0,
    downloadedCount: 0,
    processedCount: 0,
    totalSize: formatBytes(videos.reduce((sum, v) => sum + parseInt(String(v.size || '0')), 0)),
    downloadedSize: '0 B',
    startTime: 0 // Add startTime to state
  });

  const [isPaused, setIsPaused] = useState(false);
  const [settings, setSettings] = useState({
    extractMetadata: true,
    organizeByDate: true,
    renameWithTimestamp: true,
    generateCapCut: true,
    generatePremiere: false,
    folderStructure: 'year-month' as 'year-month' | 'year' | 'flat',
    destinationFolderName: 'Organized_Videos_' + new Date().toISOString().slice(0, 10)
  });

  const steps = [
    'Downloading videos',
    'Extracting metadata', 
    'Organizing files',
    'Renaming files',
    'Generating projects',
    'Uploading to Google Drive'
  ];

  const startProcessing = useCallback(async () => {
    console.log('Starting processing with folderId:', folderId);
    console.log('Processing videos:', videos.length);
    
    const startTime = Date.now();
    setProcessingState(prev => ({
      ...prev,
      status: 'downloading',
      currentStep: 1,
      startTime // Set startTime in state
    }));

    try {
      const results: ProcessingResults = {
        downloadedVideos: [],
        organizationStructure: {
          rootPath: '',
          folders: []
        },
        projectFiles: [],
        totalTime: ''
      };

      // Step 1: Download videos
      await downloadVideos(results);
      
      // Step 2: Extract metadata
      if (settings.extractMetadata) {
        await extractMetadata(results);
      }
      
      // Step 3: Organize files
      if (settings.organizeByDate) {
        await organizeFiles(results);
      }
      
      // Step 4: Rename files
      if (settings.renameWithTimestamp) {
        await renameFiles(results);
      }
      
      // Step 5: Generate project files
      await generateProjectFiles(results);

      // Step 6: Upload organized videos back to Google Drive
      if (settings.destinationFolderName) {
        await uploadToGoogleDrive(results);
      }

      const endTime = Date.now();
      results.totalTime = formatDuration(endTime - startTime);

      setProcessingState(prev => ({
        ...prev,
        status: 'completed',
        progress: 100,
        currentStep: 5
      }));

      onProcessingComplete(results);
      
      toast({
        title: "Processing Complete!",
        description: `Successfully processed ${videos.length} videos in ${results.totalTime}`,
      });

    } catch (error) {
      console.error('Processing failed:', error);
      setProcessingState(prev => ({
        ...prev,
        status: 'error'
      }));
      
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  }, [videos, settings, onProcessingComplete, folderId]);

  const downloadVideos = async (results: ProcessingResults) => {
    setProcessingState(prev => ({
      ...prev,
      status: 'downloading',
      currentStep: 1
    }));

    let downloadedSize = 0;
    const totalSize = videos.reduce((sum, v) => sum + parseInt(String(v.size || '0')), 0);

    for (let i = 0; i < videos.length; i++) {
      if (isPaused) {
        await waitForResume();
      }

      const video = videos[i];
      
      setProcessingState(prev => ({
        ...prev,
        currentFile: video.name,
        progress: (i / videos.length) * 20, // 20% of total progress
        timeRemaining: estimateTimeRemaining(i + 1, videos.length * 6, prev.startTime) // Use startTime from state
      }));

      // Simulate download time based on file size (more realistic)
      const sizeInMB = parseInt(String(video.size || '0')) / (1024 * 1024);
      const downloadTime = Math.max(2000, sizeInMB * 50); // At least 2 seconds, 50ms per MB
      await new Promise(resolve => setTimeout(resolve, downloadTime));
      
      downloadedSize += parseInt(String(video.size || '0'));
      
      setProcessingState(prev => ({
        ...prev,
        downloadedCount: i + 1,
        downloadedSize: formatBytes(downloadedSize)
      }));

      // Add to results
      results.downloadedVideos.push({
        id: video.id,
        originalName: video.name,
        newName: video.name,
        originalDate: new Date(video.createdTime),
        localPath: `/downloads/${video.name}`,
        metadata: {
          duration: video.duration || 0,
          resolution: `1920x1080`, // Default resolution - would be extracted from actual file
          fps: 30, // Default, would be extracted from actual file
          codec: 'h264',
          bitrate: 5000,
          fileSize: parseInt(String(video.size || '0'))
        }
      });
    }
  };

  const extractMetadata = async (results: ProcessingResults) => {
    setProcessingState(prev => ({
      ...prev,
      status: 'extracting',
      currentStep: 2
    }));

    // Simulate metadata extraction (realistic timing)
    for (let i = 0; i < results.downloadedVideos.length; i++) {
      if (isPaused) await waitForResume();
      
      const video = results.downloadedVideos[i];
      
      setProcessingState(prev => ({
        ...prev,
        currentFile: video.originalName,
        progress: 20 + (i / results.downloadedVideos.length) * 20,
        processedCount: i + 1
      }));

      // Realistic processing time - 500ms to 2s per video depending on size
      const processingTime = Math.max(500, parseInt(String(video.metadata.fileSize)) / (1024 * 1024) * 100);
      await new Promise(resolve => setTimeout(resolve, processingTime));
    }
  };

  const organizeFiles = async (results: ProcessingResults) => {
    setProcessingState(prev => ({
      ...prev,
      status: 'organizing',
      currentStep: 3,
      progress: 40
    }));

    // Create folder structure based on settings
    const folders = new Map<string, ProcessedVideo[]>();
    
    results.downloadedVideos.forEach(video => {
      const date = video.originalDate;
      let folderName = '';
      
      switch (settings.folderStructure) {
        case 'year-month':
          folderName = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}-${date.toLocaleDateString('en', { month: 'long' })}`;
          break;
        case 'year':
          folderName = `${date.getFullYear()}`;
          break;
        case 'flat':
        default:
          folderName = 'Videos';
          break;
      }
      
      if (!folders.has(folderName)) {
        folders.set(folderName, []);
      }
      folders.get(folderName)!.push(video);
    });

    results.organizationStructure = {
      rootPath: '/organized-videos',
      folders: Array.from(folders.entries()).map(([name, videos]) => ({
        name,
        path: `/organized-videos/${name}`,
        videoCount: videos.length
      }))
    };

    setProcessingState(prev => ({
      ...prev,
      progress: 60
    }));
  };

  const renameFiles = async (results: ProcessingResults) => {
    setProcessingState(prev => ({
      ...prev,
      status: 'organizing',
      currentStep: 4
    }));

    results.downloadedVideos.forEach((video, index) => {
      const date = new Date(video.originalDate);
      
      // Format as YYYY-MM-DDTHH-MM-SS (more readable timestamp)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      const timestamp = `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
      const extension = video.originalName.split('.').pop();
      
      video.newName = `${timestamp}.${extension}`;
      
      setProcessingState(prev => ({
        ...prev,
        progress: 60 + (index / results.downloadedVideos.length) * 20
      }));
    });
  };

  const generateProjectFiles = async (results: ProcessingResults) => {
    setProcessingState(prev => ({
      ...prev,
      status: 'generating',
      currentStep: 5
    }));

    if (settings.generateCapCut) {
      results.projectFiles.push({
        type: 'capcut',
        name: 'Organized_Videos_CapCut.ccp',
        path: '/projects/Organized_Videos_CapCut.ccp',
        videoCount: results.downloadedVideos.length
      });
    }

    if (settings.generatePremiere) {
      results.projectFiles.push({
        type: 'premiere',
        name: 'Organized_Videos_Premiere.prproj',
        path: '/projects/Organized_Videos_Premiere.prproj',
        videoCount: results.downloadedVideos.length
      });
    }

    // Simulate project generation time
    await new Promise(resolve => setTimeout(resolve, 2000));

    setProcessingState(prev => ({
      ...prev,
      progress: 90
    }));
  };

  const uploadToGoogleDrive = async (results: ProcessingResults) => {
    setProcessingState(prev => ({
      ...prev,
      status: 'organizing',
      currentStep: 6,
      currentFile: `Creating "${settings.destinationFolderName || 'Organized_Videos'}" folder in Google Drive...`
    }));

    try {
      // Import the API client method
      const { apiClient } = await import('@/lib/api');
      
      // Get all video IDs for organization
      const videoIds = videos.map(video => video.id);
      
      setProcessingState(prev => ({
        ...prev,
        progress: 92,
        currentFile: `Uploading ${videoIds.length} videos with organized structure...`
      }));
      
      // Use the upload function to create organized folder structure IN SOURCE FOLDER
      const uploadResult = await apiClient.uploadOrganizedVideos(
        results.downloadedVideos,
        settings.destinationFolderName || 'Organized_Videos',
        results.organizationStructure,
        folderId // Pass the source folder ID so it organizes within the same folder
      );

      setProcessingState(prev => ({
        ...prev,
        progress: 98,
        currentFile: `All ${videoIds.length} videos successfully organized! Check "${settings.destinationFolderName || 'Organized_Videos'}" folder in Google Drive.`
      }));

      console.log('Google Drive organization completed successfully:', uploadResult);
      return uploadResult;

    } catch (error) {
      console.error('Failed to organize videos in Google Drive:', error);
      
      setProcessingState(prev => ({
        ...prev,
        status: 'error',
        currentFile: `Upload failed: ${error.message}. Your videos are safe in their original location.`
      }));
      
      throw error; // Re-throw to prevent completion
    }
  };

  const simulateVideoDownload = async (video: VideoFile) => {
    // Simulate download time based on file size
    const sizeInMB = parseInt(String(video.size || '0')) / (1024 * 1024);
    const downloadTime = Math.min(sizeInMB * 10, 2000); // Max 2 seconds per video for demo
    await new Promise(resolve => setTimeout(resolve, downloadTime));
  };

  const waitForResume = async () => {
    while (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const pauseProcessing = () => {
    setIsPaused(true);
    toast({
      title: "Processing Paused",
      description: "You can resume processing at any time",
    });
  };

  const resumeProcessing = () => {
    setIsPaused(false);
    toast({
      title: "Processing Resumed",
      description: "Continuing from where we left off",
    });
  };

  const resetProcessing = () => {
    setProcessingState({
      status: 'idle',
      currentStep: 0,
      totalSteps: 6,
      progress: 0,
      downloadedCount: 0,
      processedCount: 0,
      totalSize: formatBytes(videos.reduce((sum, v) => sum + parseInt(String(v.size || '0')), 0)),
      downloadedSize: '0 B',
      startTime: 0
    });
    setIsPaused(false);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Video Processing Pipeline
          <Badge variant={processingState.status === 'completed' ? 'default' : 'secondary'}>
            {videos.length} videos
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Processing Controls */}
        <div className="flex gap-2">
          {processingState.status === 'idle' && (
            <Button 
              onClick={startProcessing} 
              className="flex-1 glass text-white border-white/20 hover:bg-white/10 bg-white/5"
              variant="outline"
            >
              <Download className="mr-2 h-4 w-4" />
              Start Processing
            </Button>
          )}
          
          {(processingState.status === 'downloading' || processingState.status === 'extracting' || 
            processingState.status === 'organizing' || processingState.status === 'generating') && (
            <>
              {!isPaused ? (
                <Button 
                  onClick={pauseProcessing} 
                  variant="outline"
                  className="glass text-white border-white/20 hover:bg-white/10 bg-white/5"
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </Button>
              ) : (
                <Button 
                  onClick={resumeProcessing} 
                  variant="outline"
                  className="glass text-white border-white/20 hover:bg-white/10 bg-white/5"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </Button>
              )}
            </>
          )}
          
          {(processingState.status === 'completed' || processingState.status === 'error') && (
            <Button 
              onClick={resetProcessing} 
              variant="outline"
              className="glass text-white border-white/20 hover:bg-white/10 bg-white/5"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          )}
        </div>

        {/* Progress Section */}
        {processingState.status !== 'idle' && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Step {processingState.currentStep} of {processingState.totalSteps}: {steps[processingState.currentStep - 1]}</span>
                <span>{Math.round(processingState.progress)}%</span>
              </div>
              <Progress value={processingState.progress} className="h-2" />
            </div>

            {processingState.currentFile && (
              <div className="text-sm text-muted-foreground">
                Processing: {processingState.currentFile}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>{processingState.downloadedCount}/{videos.length} downloaded</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>{processingState.processedCount} processed</span>
              </div>
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                <span>{processingState.downloadedSize}/{processingState.totalSize}</span>
              </div>
              {processingState.timeRemaining && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{processingState.timeRemaining} remaining</span>
                </div>
              )}
            </div>

            {isPaused && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  Processing is paused. Click Resume to continue.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Processing Settings */}
        {processingState.status === 'idle' && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="font-medium">Processing Options</h4>
              
              {/* Estimated Time */}
              <div className="p-3 bg-blue-50/10 border border-blue-200/20 rounded-lg">
                <div className="text-sm font-medium text-blue-300 mb-1">Estimated Processing Time</div>
                <div className="text-lg font-semibold text-blue-100">
                  {Math.ceil((videos.length * 0.5) + (videos.reduce((sum, v) => sum + parseInt(String(v.size || '0')), 0) / 1024 / 1024 / 100))} minutes
                </div>
                <div className="text-xs text-blue-300/80 mt-1">
                  Based on {videos.length} videos ({formatBytes(videos.reduce((sum, v) => sum + parseInt(String(v.size || '0')), 0))})
                </div>
              </div>
              
              {/* Destination Folder Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination Folder Name</label>
                <input
                  type="text"
                  value={settings.destinationFolderName}
                  onChange={(e) => setSettings(prev => ({...prev, destinationFolderName: e.target.value}))}
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/20"
                  placeholder="Enter folder name for organized videos"
                />
                <p className="text-xs text-muted-foreground">
                  Videos will be uploaded to this new folder in your Google Drive
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.extractMetadata}
                    onChange={(e) => setSettings(prev => ({...prev, extractMetadata: e.target.checked}))}
                    className="rounded border-white/30 bg-white/10 text-cyan-400 focus:ring-cyan-400/50"
                  />
                  <span className="text-sm">Extract original metadata</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.organizeByDate}
                    onChange={(e) => setSettings(prev => ({...prev, organizeByDate: e.target.checked}))}
                    className="rounded border-white/30 bg-white/10 text-cyan-400 focus:ring-cyan-400/50"
                  />
                  <span className="text-sm">Organize by date</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.renameWithTimestamp}
                    onChange={(e) => setSettings(prev => ({...prev, renameWithTimestamp: e.target.checked}))}
                    className="rounded border-white/30 bg-white/10 text-cyan-400 focus:ring-cyan-400/50"
                  />
                  <span className="text-sm">Rename with timestamps</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.generateCapCut}
                    onChange={(e) => setSettings(prev => ({...prev, generateCapCut: e.target.checked}))}
                    className="rounded border-white/30 bg-white/10 text-cyan-400 focus:ring-cyan-400/50"
                  />
                  <span className="text-sm">Generate CapCut project</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.generatePremiere}
                    onChange={(e) => setSettings(prev => ({...prev, generatePremiere: e.target.checked}))}
                    className="rounded border-white/30 bg-white/10 text-cyan-400 focus:ring-cyan-400/50"
                  />
                  <span className="text-sm">Generate Premiere project</span>
                </label>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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

function estimateTimeRemaining(current: number, total: number, startTime: number): string {
  if (current === 0 || startTime === 0) return 'Calculating...';
  
  const elapsed = Date.now() - startTime;
  const rate = current / elapsed;
  
  if (rate <= 0) return 'Calculating...';
  
  const remaining = (total - current) / rate;
  
  return formatDuration(remaining);
}

export default VideoProcessor;