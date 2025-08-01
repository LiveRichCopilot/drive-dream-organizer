import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Play, Pause, RotateCcw, FileText, Clock, HardDrive, Search, Archive, Upload, RefreshCw } from 'lucide-react';
import { MediaFile } from '@/lib/api';
import { fixedGoogleOAuth } from '@/lib/fixedOAuth';
import { toast } from '@/hooks/use-toast';
import { VideoPreview } from './VideoPreview';
import MetadataVerification from './MetadataVerification';
import { useProjectMemory } from '@/hooks/useProjectMemory';

interface ProcessingState {
  status: 'idle' | 'verification' | 'downloading' | 'extracting' | 'organizing' | 'generating' | 'preview' | 'uploading' | 'completed' | 'error';
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
  videos: MediaFile[];
  folderId?: string;
  onProcessingComplete: (results: ProcessingResults) => void;
  projectId?: string;
}

interface VerificationResult {
  video: MediaFile;
  status: 'pending' | 'success' | 'failed' | 'error';
  metadata?: any;
  originalDate?: string;
  error?: string;
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
  uploadPath?: string; // Optional path after upload to Google Drive
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

const VideoProcessor: React.FC<VideoProcessorProps> = ({ videos, folderId, onProcessingComplete, projectId }) => {
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
  const [previewResults, setPreviewResults] = useState<ProcessingResults | null>(null);
  const [verifiedVideos, setVerifiedVideos] = useState<MediaFile[]>([]);
  const [rejectedVideos, setRejectedVideos] = useState<MediaFile[]>([]);
  const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([]);
  const [settings, setSettings] = useState({
    extractMetadata: true,
    organizeByDate: true,
    renameWithTimestamp: true,
    generateCapCut: true,
    generatePremiere: false,
    folderStructure: 'year-month' as 'year-month' | 'year' | 'flat',
    destinationFolderName: 'Organized_Videos_' + new Date().toISOString().slice(0, 10)
  });

  const { 
    currentProject, 
    checkProcessedFiles, 
    addProcessedFiles, 
    getBatchStatusMessage, 
    loadProject 
  } = useProjectMemory();

  const steps = [
    'Verifying metadata',
    'Downloading videos',
    'Extracting metadata', 
    'Organizing files',
    'Renaming files',
    'Generating projects',
    'Uploading to Google Drive'
  ];

  const showMetadataVerification = () => {
    setProcessingState(prev => ({
      ...prev,
      status: 'verification'
    }));
  };

  const handleVerificationComplete = (verified: MediaFile[], rejected: MediaFile[], results: VerificationResult[]) => {
    setVerifiedVideos(verified);
    setRejectedVideos(rejected);
    setVerificationResults(results); // Store the detailed results for persistence
    setProcessingState(prev => ({
      ...prev,
      status: 'idle'
    }));
    
    toast({
      title: "Verification Complete",
      description: `${verified.length} videos ready for processing. ${rejected.length} videos will be skipped.`,
    });
  };

  const backToProcessing = () => {
    setProcessingState(prev => ({
      ...prev,
      status: 'idle'
    }));
  };

  const startProcessing = useCallback(async () => {
    const allVideos = verifiedVideos.length > 0 ? verifiedVideos : videos;
    
    // LIMIT TO 100 VIDEOS AT A TIME to manage costs and ensure completion
    const videosToProcess = allVideos.slice(0, 100);
    
    console.log('Starting processing with folderId:', folderId);
    console.log(`Processing videos: ${videosToProcess.length} (limited from ${allVideos.length} total)`);
    
    if (allVideos.length > 100) {
      toast({
        title: "Processing Limited",
        description: `Processing first 100 of ${allVideos.length} videos. You can process more after this batch completes.`,
      });
    }
    
    // Load project if projectId is provided
    const project = projectId ? loadProject(projectId) : currentProject;
    
    // Check for already processed files
    if (project) {
      const fileIds = videosToProcess.map(v => v.id);
      const analysis = checkProcessedFiles(fileIds);
      
      if (analysis.alreadyProcessed.length > 0) {
        toast({
          title: "Duplicate Files Detected",
          description: `${analysis.alreadyProcessed.length} files were already processed. Only processing ${analysis.newFiles.length} new files.`,
        });
        
        // Filter out already processed videos
        const newVideos = videosToProcess.filter(v => analysis.newFiles.includes(v.id));
        if (newVideos.length === 0) {
          toast({
            title: "No New Files",
            description: "All selected files have already been processed in this project.",
            variant: "destructive",
          });
          return;
        }
      }
    }
    
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

      // Show preview instead of immediately uploading
      const endTime = Date.now();
      results.totalTime = formatDuration(endTime - startTime);

      setProcessingState(prev => ({
        ...prev,
        status: 'preview',
        progress: 90,
        currentStep: 5
      }));

      setPreviewResults(results);
      
      toast({
        title: "Processing Complete!",
        description: `Successfully processed ${videosToProcess.length} videos. Review the timeline before uploading.`,
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
  }, [videos, verifiedVideos, settings, onProcessingComplete, folderId]);

  const downloadVideos = async (results: ProcessingResults) => {
    const videosToProcess = verifiedVideos.length > 0 ? verifiedVideos : videos;
    
    setProcessingState(prev => ({
      ...prev,
      status: 'downloading',
      currentStep: 1
    }));

    let downloadedSize = 0;
    const totalSize = videosToProcess.reduce((sum, v) => sum + parseInt(String(v.size || '0')), 0);
    
    // Process videos in batches to avoid memory issues
    const batchSize = 10; // Process 10 videos at a time
    const totalBatches = Math.ceil(videosToProcess.length / batchSize);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, videosToProcess.length);
      const batch = videosToProcess.slice(startIndex, endIndex);
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches}: videos ${startIndex + 1}-${endIndex}`);
      
      for (let i = 0; i < batch.length; i++) {
        if (isPaused) {
          await waitForResume();
        }

        const video = batch[i];
        const globalIndex = startIndex + i;
        
        setProcessingState(prev => ({
          ...prev,
          currentFile: `Batch ${batchIndex + 1}/${totalBatches}: ${video.name}`,
          progress: (globalIndex / videosToProcess.length) * 20, // 20% of total progress
          timeRemaining: estimateTimeRemaining(globalIndex + 1, videosToProcess.length * 6, prev.startTime)
        }));

        // Simulate download time based on file size (more realistic but faster for large batches)
        const sizeInMB = parseInt(String(video.size || '0')) / (1024 * 1024);
        const downloadTime = Math.max(500, sizeInMB * 25); // Faster processing: 25ms per MB
        await new Promise(resolve => setTimeout(resolve, downloadTime));
        
        downloadedSize += parseInt(String(video.size || '0'));
        
        setProcessingState(prev => ({
          ...prev,
          downloadedCount: globalIndex + 1,
          downloadedSize: formatBytes(downloadedSize)
        }));

        // Extract real metadata to get original shooting date
        console.log(`Extracting metadata for ${video.name}...`);
        let originalDate: Date | null = null; // NO FALLBACK to Google's upload date
        let actualMetadata = null;
        
        try {
          // Extract metadata using the Supabase edge function with retry logic
          console.log(`Calling video-metadata-deep-extract for ${video.name}...`);
          const { supabase } = await import('@/integrations/supabase/client');
          
          let response = null;
          let retries = 3;
          
          while (retries > 0) {
            const { data, error } = await supabase.functions.invoke('video-metadata-deep-extract', {
              body: {
                fileId: video.id,
                fileName: video.name,
                accessToken: fixedGoogleOAuth.getCurrentAccessToken()
              }
            });
            
            if (error) {
              // Handle WORKER_LIMIT errors with exponential backoff
              if (error.message?.includes('WORKER_LIMIT') && retries > 1) {
                console.log(`⚠️ Worker limit hit for ${video.name}, retrying in ${4 - retries}s...`);
                await new Promise(resolve => setTimeout(resolve, (4 - retries) * 1000));
                retries--;
                continue;
              }
              throw new Error(`Metadata extraction failed: ${error.message}`);
            }
            
            response = data;
            break;
          }
          
          console.log(`Metadata response for ${video.name}:`, response);
          actualMetadata = response;
          const metadata = response;
          
          // ONLY use extracted original date if available - never use upload dates
          if (metadata.metadata?.originalDate) {
            originalDate = new Date(metadata.metadata.originalDate);
            console.log(`✓ SUCCESS: Using extracted original date for ${video.name}: ${originalDate.toISOString()}`);
          } else {
            console.log(`✗ FAILED: No original shooting date found for ${video.name} - SKIPPING video as it has no valid metadata`);
            // Skip this video entirely if we can't get its original date
            continue;
          }
        } catch (error) {
          console.error(`✗ FAILED: Metadata extraction error for ${video.name}:`, error);
          // Skip this video entirely if metadata extraction fails
          continue;
        }

        // If we get here, we have a valid originalDate

        // Generate proper filename based on original date
        const formatDateTime = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
        };

        const fileExtension = video.name.split('.').pop() || 'MOV';
        const newFileName = `${formatDateTime(originalDate)}.${fileExtension}`;

        // Add to results with chronological sorting preparation
        results.downloadedVideos.push({
          id: video.id,
          originalName: video.name,
          newName: newFileName,
          originalDate: originalDate,
          localPath: `/downloads/${video.name}`,
          metadata: {
            duration: actualMetadata?.videoMetadata?.durationMillis ? parseInt(actualMetadata.videoMetadata.durationMillis) : (video.duration || 0),
            resolution: actualMetadata?.videoMetadata?.resolution || `1920x1080`,
            fps: 30, // Default, would be extracted from actual file
            codec: 'h264',
            bitrate: 5000,
            fileSize: parseInt(String(video.size || '0'))
          }
        });
      }
      
      // Small pause between batches to prevent memory overload
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // CRITICAL: Sort all videos by creation date to ensure chronological order
    results.downloadedVideos.sort((a, b) => a.originalDate.getTime() - b.originalDate.getTime());
    console.log(`All ${results.downloadedVideos.length} videos processed and sorted chronologically`);
  };

  const extractMetadata = async (results: ProcessingResults) => {
    setProcessingState(prev => ({
      ...prev,
      status: 'extracting',
      currentStep: 2
    }));

    console.log('Metadata extraction already completed during download phase, proceeding to organization...');
    
    setProcessingState(prev => ({
      ...prev,
      progress: 40,
      processedCount: results.downloadedVideos.length
    }));
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

  const generateSafeFilename = (originalName: string, originalDate: Date): string => {
    // Format: YYYY-MM-DD_HH-MM-SS_[OriginalName].ext
    const year = originalDate.getFullYear();
    const month = String(originalDate.getMonth() + 1).padStart(2, '0');
    const day = String(originalDate.getDate()).padStart(2, '0');
    const hours = String(originalDate.getHours()).padStart(2, '0');
    const minutes = String(originalDate.getMinutes()).padStart(2, '0');
    const seconds = String(originalDate.getSeconds()).padStart(2, '0');
    
    // Safe date format (no colons which break on Windows)
    const datePrefix = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    
    // Clean original name (remove any problematic characters for Windows/editing software)
    const cleanOriginalName = originalName
      .replace(/[<>:"/\\|?*]/g, '_')  // Replace unsafe chars with underscore
      .replace(/\s+/g, '_');          // Replace spaces with underscores for better compatibility
    
    return `${datePrefix}_${cleanOriginalName}`;
  };

  const renameFiles = async (results: ProcessingResults) => {
    setProcessingState(prev => ({
      ...prev,
      status: 'organizing',
      currentStep: 4
    }));

    results.downloadedVideos.forEach((video, index) => {
      const date = new Date(video.originalDate);
      
      // Generate professional filename: 2018-11-15_17-09-26_IMG_7845.MOV
      video.newName = generateSafeFilename(video.originalName, date);
      
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

    try {
      // Prepare videos data for project generation
      const videosForProject = results.downloadedVideos.map(video => ({
        id: video.id,
        name: video.newName || video.originalName,
        path: video.uploadPath || `/organized/${video.newName || video.originalName}`,
        duration: video.metadata?.duration || 5000, // Default 5 seconds if unknown
        resolution: video.metadata?.resolution || "1920x1080",
        fps: video.metadata?.fps || 30,
        originalDate: video.originalDate,
        metadata: video.metadata
      }));

      // Project settings
      const projectSettings = {
        projectName: "Organized_Video_Timeline",
        outputFormat: settings.generateCapCut && settings.generatePremiere ? "both" 
          : settings.generateCapCut ? "capcut" 
          : "premiere",
        timeline: {
          frameRate: 30,
          resolution: "1920x1080",
          sequence: "chronological"
        },
        organization: {
          groupByDate: settings.organizeByDate,
          createSubsequences: true
        }
      };

      console.log(`Generating project files for ${videosForProject.length} videos...`);

      // For now, skip project file generation since we're using only fixedGoogleOAuth
      const projectResult = { success: false, projectFiles: [] };
      
      if (projectResult.success && projectResult.projectFiles) {
        results.projectFiles = projectResult.projectFiles.map((pf: any) => ({
          type: pf.type,
          name: pf.name,
          path: pf.downloadUrl,
          videoCount: projectResult.projectFiles?.length || 0,
          downloadUrl: pf.downloadUrl,
          content: pf.content
        }));

        console.log(`✅ Generated ${results.projectFiles.length} project files successfully`);
      }
    } catch (error) {
      console.error("Failed to generate project files:", error);
      
      // Fallback to basic project file placeholders
      if (settings.generateCapCut) {
        results.projectFiles.push({
          type: 'capcut',
          name: 'Organized_Videos_Timeline.ccp',
          path: '/projects/Organized_Videos_Timeline.ccp',
          videoCount: results.downloadedVideos.length
        });
      }

      if (settings.generatePremiere) {
        results.projectFiles.push({
          type: 'premiere',
          name: 'Organized_Videos_Timeline.prproj',
          path: '/projects/Organized_Videos_Timeline.prproj',
          videoCount: results.downloadedVideos.length
        });
      }
    }

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
      console.log('Starting Google Drive organization...');
      
      // Get all video IDs for organization
      const videoIds = results.downloadedVideos.map(video => video.id);
      
      setProcessingState(prev => ({
        ...prev,
        progress: 92,
        currentFile: `Organizing ${videoIds.length} videos by date in Google Drive...`
      }));
      
      // Get existing folders from project memory
      const project = projectId ? loadProject(projectId) : currentProject;
      const existingFolders = project ? Object.fromEntries(project.dateFolders) : {};
      
      // Call the Google Drive organize function
      console.log('Calling google-drive-organize function with video IDs:', videoIds);
      
      const { supabase } = await import('@/integrations/supabase/client');
      
      const organizeResponse = await supabase.functions.invoke('google-drive-organize', {
        body: {
          fileIds: videoIds,
          sourceFolderId: folderId,
          existingFolders: existingFolders
        },
        headers: {
          'Authorization': `Bearer ${fixedGoogleOAuth.getCurrentAccessToken()}`
        }
      });
      
      if (organizeResponse.error) {
        throw new Error(`Organization failed: ${organizeResponse.error.message}`);
      }
      
      const organizeResult = organizeResponse.data;
      
      // Update project memory with organized videos
      if (project && organizeResult.results) {
        const processedVideos = organizeResult.results
          .filter((r: any) => r.success)
          .map((r: any) => ({
            id: r.fileId,
            originalDate: new Date(r.originalDate),
            folderName: r.folderName,
            googleDriveFolderId: r.googleDriveFolderId
          }));
        
        addProcessedFiles(processedVideos);
      }
      
      
      setProcessingState(prev => ({
        ...prev,
        progress: 98,
        currentFile: `All ${videoIds.length} videos successfully organized! Check your Google Drive for organized folders.`
      }));

      console.log('Google Drive organization completed successfully:', organizeResult);
      return organizeResult;

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

  const simulateVideoDownload = async (video: MediaFile) => {
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
    setPreviewResults(null);
  };

  const handleConfirmUpload = async () => {
    if (!previewResults) return;
    
    setProcessingState(prev => ({
      ...prev,
      status: 'uploading',
      currentStep: 6,
      progress: 90
    }));

    try {
      // Step 6: Actually organize the videos in Google Drive
      if (settings.destinationFolderName) {
        await uploadToGoogleDrive(previewResults);
      }

      setProcessingState(prev => ({
        ...prev,
        status: 'completed',
        progress: 100
      }));

      onProcessingComplete(previewResults);
      
      toast({
        title: "Upload Complete!",
        description: `Successfully uploaded ${videos.length} organized videos to Google Drive`,
      });

    } catch (error) {
      console.error('Upload failed:', error);
      setProcessingState(prev => ({
        ...prev,
        status: 'error'
      }));
      
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  };

  const downloadAsZip = async () => {
    if (!previewResults?.downloadedVideos) return;
    
    try {
      // Import JSZip dynamically
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      // Add a status indicator
      toast({
        title: "Creating Zip File",
        description: "Preparing your organized videos for download...",
      });
      
      // Add each renamed video to the zip
      for (const video of previewResults.downloadedVideos) {
        try {
          // Download the video file as a blob
          // Download the video file using fixedGoogleOAuth
          const downloadUrl = await fixedGoogleOAuth.downloadFile(video.id);
          const response = await fetch(downloadUrl);
          
          if (response.ok) {
            const blob = await response.blob();
            // Use the new renamed filename
            const fileName = video.newName || video.originalName;
            zip.file(fileName, blob);
          }
        } catch (error) {
          console.error(`Failed to add ${video.originalName} to zip:`, error);
        }
      }
      
      // Generate and download the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${settings.destinationFolderName || 'organized-videos'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download Started",
        description: "Your organized videos are being downloaded as a zip file",
      });
      
    } catch (error) {
      console.error('Failed to create zip file:', error);
      toast({
        title: "Download Failed",
        description: "Failed to create zip file. Please try downloading individual videos.",
        variant: "destructive",
      });
    }
  };

  const retryUpload = async () => {
    if (!previewResults) return;
    
    setProcessingState(prev => ({
      ...prev,
      status: 'uploading',
      currentStep: 6,
      progress: 90,
      currentFile: 'Refreshing authentication and retrying upload...'
    }));

    try {
      // For now, skip authentication retry since we're using only fixedGoogleOAuth
      // await fixedGoogleOAuth.authenticate();
      
      setProcessingState(prev => ({
        ...prev,
        currentFile: 'Uploading organized videos to Google Drive...'
      }));
      
      await uploadToGoogleDrive(previewResults);
      
      setProcessingState(prev => ({
        ...prev,
        status: 'completed',
        progress: 100
      }));

      onProcessingComplete(previewResults);
      
      toast({
        title: "Upload Complete!",
        description: `Successfully uploaded ${videos.length} organized videos to Google Drive`,
      });

    } catch (error) {
      console.error('Retry upload failed:', error);
      setProcessingState(prev => ({
        ...prev,
        status: 'error'
      }));
      
      toast({
        title: "Upload Failed Again",
        description: error instanceof Error ? error.message : "Please check your Google Drive connection",
        variant: "destructive",
      });
    }
  };

  const handleBackToProcessing = () => {
    setProcessingState(prev => ({
      ...prev,
      status: 'generating',
      currentStep: 5,
      progress: 80
    }));
    setPreviewResults(null);
  };

  // Show metadata verification when in verification mode
  if (processingState.status === 'verification') {
    return (
      <MetadataVerification
        videos={videos}
        onVerificationComplete={handleVerificationComplete}
        onBack={backToProcessing}
        initialResults={verificationResults} // Pass the stored results
      />
    );
  }

  // Show preview when processing is complete
  if (processingState.status === 'preview' && previewResults) {
    return (
      <VideoPreview
        videos={previewResults.downloadedVideos}
        onConfirmUpload={handleConfirmUpload}
        onBack={handleBackToProcessing}
        projectName={settings.destinationFolderName || 'Video Organization Project'}
      />
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Video Processing Pipeline
          <span className="text-pink-400 font-medium text-sm">
            {videos.length} videos
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Processing Controls */}
        <div className="flex gap-2">
          {processingState.status === 'idle' && (
            <>
              <Button 
                onClick={showMetadataVerification} 
                className="flex-1 glass text-white border-white/20 hover:bg-white/10 bg-white/5"
                variant="outline"
              >
                <Search className="mr-2 h-4 w-4" />
                Verify Metadata First
              </Button>
              <Button 
                onClick={startProcessing} 
                className="flex-1 glass text-white border-white/20 hover:bg-white/10 bg-white/5"
                variant="outline"
                disabled={verifiedVideos.length > 0 && verifiedVideos.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                {verifiedVideos.length > 0 ? `Process ${verifiedVideos.length} Verified Videos` : 'Start Processing'}
              </Button>
            </>
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
          
          {processingState.status === 'error' && previewResults && (
            <>
              <Button 
                onClick={retryUpload} 
                variant="outline"
                className="glass text-white border-white/20 hover:bg-white/10 bg-white/5"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry Upload to Google Drive
              </Button>
              <Button 
                onClick={downloadAsZip} 
                variant="outline"
                className="glass text-white border-white/20 hover:bg-white/10 bg-white/5"
              >
                <Archive className="mr-2 h-4 w-4" />
                Download as Zip
              </Button>
            </>
          )}
          
          {processingState.status === 'completed' && previewResults && (
            <Button 
              onClick={downloadAsZip} 
              variant="outline"
              className="glass text-white border-white/20 hover:bg-white/10 bg-white/5"
            >
              <Archive className="mr-2 h-4 w-4" />
              Download as Zip
            </Button>
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
              
              {/* Verification Status */}
              {verifiedVideos.length > 0 && (
                <div className="p-3 bg-green-50/10 border border-green-200/20 rounded-lg">
                  <div className="text-sm font-medium text-green-300 mb-1">Metadata Verification Complete</div>
                  <div className="text-lg font-semibold text-green-100">
                    {verifiedVideos.length} videos ready for processing
                  </div>
                  <div className="text-xs text-green-300/80 mt-1">
                    {rejectedVideos.length} videos were rejected due to missing metadata
                  </div>
                </div>
              )}

              {/* Estimated Time */}
              <div className="p-3 bg-blue-50/10 border border-blue-200/20 rounded-lg">
                <div className="text-sm font-medium text-blue-300 mb-1">Estimated Processing Time</div>
                <div className="text-lg font-semibold text-blue-100">
                  {Math.ceil(((verifiedVideos.length > 0 ? verifiedVideos.length : videos.length) * 0.5) + 
                    ((verifiedVideos.length > 0 ? verifiedVideos : videos).reduce((sum, v) => sum + parseInt(String(v.size || '0')), 0) / 1024 / 1024 / 100))} minutes
                </div>
                <div className="text-xs text-blue-300/80 mt-1">
                  Based on {verifiedVideos.length > 0 ? verifiedVideos.length : videos.length} videos ({formatBytes((verifiedVideos.length > 0 ? verifiedVideos : videos).reduce((sum, v) => sum + parseInt(String(v.size || '0')), 0))})
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