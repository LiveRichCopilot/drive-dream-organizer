import { useState, useCallback } from 'react';
import { directGoogleDrive } from '@/lib/directGoogleDrive';
import { toast } from '@/hooks/use-toast';
import { MediaFile } from '@/lib/api';

export const useDirectGoogleDrive = (folderId?: string) => {
  const [isConnected, setIsConnected] = useState(directGoogleDrive.isAuthenticated());
  const [isLoading, setIsLoading] = useState(false);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [showClientIdInput, setShowClientIdInput] = useState(false);

  const connect = useCallback(async (clientId?: string) => {
    // If no clientId provided, show input
    if (!clientId) {
      setShowClientIdInput(true);
      return;
    }

    setIsLoading(true);
    setProgress(0);

    try {
      // Simulate progress for UI feedback
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 15, 90));
      }, 300);

      await directGoogleDrive.authenticate(clientId);
      
      clearInterval(progressInterval);
      setProgress(100);
      setIsConnected(true);
      setShowClientIdInput(false);
      
      toast({
        title: "Connected!",
        description: "Successfully connected to Google Drive",
      });

      // Load videos after connection
      await loadVideos();
    } catch (error) {
      console.error('Connection failed:', error);
      
      let errorMessage = "Failed to connect to Google Drive";
      if (error instanceof Error) {
        if (error.message.includes("popup")) {
          errorMessage = "Please allow popups and try again";
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
      const targetFolderId = specificFolderId !== undefined ? specificFolderId : folderId;
      console.log('Loading files with folderId:', targetFolderId);
      
      const files = await directGoogleDrive.listFiles(targetFolderId);
      console.log('Raw files response:', files);
      
      setVideos(files);
      console.log(`Loaded ${files.length} files from ${targetFolderId ? 'folder' : 'main drive'}`);
      
      toast({
        title: "Files Loaded",
        description: `Found ${files.length} files`,
      });
    } catch (error) {
      console.error('Failed to load files:', error);
      
      if (error instanceof Error && error.message.includes('Authentication expired')) {
        setIsConnected(false);
        toast({
          title: "Session Expired",
          description: "Your Google Drive session has expired. Please reconnect to continue.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to Load Files",
          description: error instanceof Error ? error.message : "Failed to load files from Google Drive",
          variant: "destructive",
        });
      }
      
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, folderId]);

  const downloadVideo = useCallback(async (fileId: string, fileName: string) => {
    try {
      const downloadUrl = await directGoogleDrive.downloadFile(fileId);
      
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
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    directGoogleDrive.logout();
    setIsConnected(false);
    setVideos([]);
    setProgress(0);
    setShowClientIdInput(false);
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
    showClientIdInput,
    setShowClientIdInput,
    connect,
    loadVideos,
    downloadVideo,
    disconnect,
  };
};