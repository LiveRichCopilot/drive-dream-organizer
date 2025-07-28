import { useState, useCallback } from 'react';
import { apiClient, VideoFile } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export const useGoogleDrive = (folderId?: string) => {
  const [isConnected, setIsConnected] = useState(apiClient.isAuthenticated());
  const [isLoading, setIsLoading] = useState(false);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [progress, setProgress] = useState(0);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setProgress(0);

    try {
      // Simulate progress for UI feedback
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 15, 90));
      }, 300);

      await apiClient.authenticate();
      
      clearInterval(progressInterval);
      setProgress(100);
      setIsConnected(true);
      
      toast({
        title: "Connected!",
        description: "Successfully connected to Google Drive",
      });

      // Load videos after connection
      await loadVideos();
    } catch (error) {
      console.error('Connection failed:', error);
      
      // Provide more specific error messages
      let errorMessage = "Failed to connect to Google Drive";
      if (error instanceof Error) {
        if (error.message.includes("popup")) {
          errorMessage = "Please allow popups and try again";
        } else if (error.message.includes("Client ID")) {
          errorMessage = "Google authentication is not properly configured";
        } else if (error.message.includes("closed")) {
          errorMessage = "Authentication was cancelled";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
      });
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadVideos = useCallback(async (specificFolderId?: string) => {
    if (!isConnected) return;
    
    setIsLoading(true);
    try {
      // Use specificFolderId if provided, otherwise use the hook's folderId state
      const targetFolderId = specificFolderId !== undefined ? specificFolderId : folderId;
      console.log('Loading videos with folderId:', targetFolderId);
      const videoFiles = await apiClient.listVideoFiles(targetFolderId);
      console.log('Raw video files response:', videoFiles);
      console.log('Type of videoFiles:', typeof videoFiles);
      console.log('Is videoFiles an array?', Array.isArray(videoFiles));
      setVideos(videoFiles);
      console.log(`Loaded ${videoFiles.length} videos from ${targetFolderId ? 'folder' : 'main drive'}`);
      
      // Show skip message if available
      const skipMessage = (window as any).lastSkipMessage;
      if (skipMessage) {
        toast({
          title: "File Filtering Applied",
          description: skipMessage,
        });
        // Clear the message so it doesn't show again
        (window as any).lastSkipMessage = null;
      }
    } catch (error) {
      console.error('Failed to load videos:', error);
      
      // Check if it's an authentication error
      if (error instanceof Error && error.message.includes('session has expired')) {
        setIsConnected(false);
        toast({
          title: "Session Expired",
          description: "Your Google Drive session has expired. Please reconnect to continue.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to Load Videos",
          description: error instanceof Error ? error.message : "Failed to load videos from Google Drive",
          variant: "destructive",
        });
      }
      
      // Clear videos on error
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, folderId]);

  const downloadVideo = useCallback(async (fileId: string, fileName: string) => {
    try {
      const downloadUrl = await apiClient.downloadFile(fileId, fileName);
      
      // Open download in new tab
      window.open(downloadUrl, '_blank');
      
      toast({
        title: "Download Started",
        description: `Downloading ${fileName}`,
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download video",
        variant: "destructive",
      });
    }
  }, []);

  const renameVideo = useCallback(async (fileId: string, newName: string) => {
    try {
      await apiClient.renameFile(fileId, newName);
      
      // Update local state
      setVideos(prev => prev.map(video => 
        video.id === fileId 
          ? { ...video, name: newName }
          : video
      ));
    } catch (error) {
      console.error('Rename failed:', error);
    }
  }, []);

  const organizeVideos = useCallback(async () => {
    if (videos.length === 0) return;

    try {
      const fileIds = videos.map(video => video.id);
      await apiClient.organizeVideosByDate(fileIds, folderId);
      
      // Reload videos to see the new organization
      await loadVideos();
    } catch (error) {
      console.error('Organization failed:', error);
    }
  }, [videos, loadVideos, folderId]);

  const disconnect = useCallback(() => {
    apiClient.logout();
    setIsConnected(false);
    setVideos([]);
    setProgress(0);
    toast({
      title: "Disconnected",
      description: "Disconnected from Google Drive",
    });
  }, []);

  return {
    isConnected,
    isLoading,
    videos,
    progress,
    connect,
    loadVideos,
    downloadVideo,
    renameVideo,
    organizeVideos,
    disconnect,
  };
};