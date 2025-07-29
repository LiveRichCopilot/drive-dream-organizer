import { useState, useCallback, useEffect } from 'react';
import { fixedGoogleOAuth } from '@/lib/fixedOAuth';
import { toast } from '@/hooks/use-toast';
import { MediaFile } from '@/lib/api';

export const useDirectGoogleDrive = (folderId?: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [progress, setProgress] = useState(0);

  // Check authentication status on mount and periodically
  useEffect(() => {
    const checkAuthStatus = () => {
      const authenticated = fixedGoogleOAuth.isAuthenticated();
      console.log('🔍 Auth status check:', { 
        authenticated, 
        hasAccessToken: !!localStorage.getItem('google_access_token'),
        hasRefreshToken: !!localStorage.getItem('google_refresh_token')
      });
      setIsConnected(authenticated);
    };

    // Check immediately
    checkAuthStatus();

    // Check every 30 seconds to handle token expiration
    const interval = setInterval(checkAuthStatus, 30000);

    return () => clearInterval(interval);
  }, []);
  const connect = useCallback(async () => {
    setIsLoading(true);
    setProgress(0);

    try {
      // Simulate progress for UI feedback
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 15, 90));
      }, 300);

      await fixedGoogleOAuth.authenticate();
      
      clearInterval(progressInterval);
      setProgress(100);
      
      // Force immediate auth status check after successful authentication
      const authenticated = fixedGoogleOAuth.isAuthenticated();
      console.log('Auth status after authentication:', authenticated);
      setIsConnected(authenticated);
      
      if (authenticated) {
        toast({
          title: "Connected!",
          description: "Successfully connected to Google Drive",
        });

        // Load videos after connection
        await loadVideos();
      } else {
        throw new Error('Authentication failed - no valid tokens');
      }
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
      
      const files = await fixedGoogleOAuth.listFiles(targetFolderId);
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
      const downloadUrl = await fixedGoogleOAuth.downloadFile(fileId);
      
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
    fixedGoogleOAuth.logout();
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
    disconnect,
  };
};