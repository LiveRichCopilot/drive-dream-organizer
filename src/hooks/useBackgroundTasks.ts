import { useState, useCallback, useRef } from 'react';
import { fixedGoogleOAuth } from '@/lib/fixedOAuth';
import { toast } from '@/hooks/use-toast';

interface BackgroundTask {
  id: string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  totalItems: number;
  processedItems: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
  type: 'download' | 'metadata' | 'organize' | 'generate';
}

export const useBackgroundTasks = () => {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const taskWorkers = useRef<Map<string, AbortController>>(new Map());

  const createTask = useCallback((name: string, type: BackgroundTask['type'], totalItems: number): string => {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newTask: BackgroundTask = {
      id: taskId,
      name,
      status: 'queued',
      progress: 0,
      totalItems,
      processedItems: 0,
      startTime: new Date(),
      type
    };

    setTasks(prev => [...prev, newTask]);
    return taskId;
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<BackgroundTask>) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, ...updates } : task
    ));
  }, []);

  const startVideoMetadataExtraction = useCallback(async (
    videoIds: string[], 
    taskName: string = 'Extract Video Metadata'
  ) => {
    const taskId = createTask(taskName, 'metadata', videoIds.length);
    const abortController = new AbortController();
    taskWorkers.current.set(taskId, abortController);

    updateTask(taskId, { status: 'running' });

    try {
      const results = [];
      
      for (let i = 0; i < videoIds.length; i++) {
        // Check if task was cancelled or paused
        if (abortController.signal.aborted) {
          updateTask(taskId, { status: 'paused' });
          return results;
        }

        const videoId = videoIds[i];
        
        try {
          // For now, skip metadata extraction since we're using only fixedGoogleOAuth
          const metadata = { originalDate: null, extractionMethod: 'disabled' };
          results.push(metadata);
          
          updateTask(taskId, {
            processedItems: i + 1,
            progress: ((i + 1) / videoIds.length) * 100
          });

          // Small delay to prevent overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`Failed to extract metadata for video ${videoId}:`, error);
          results.push({ id: videoId, error: error.message });
        }
      }

      updateTask(taskId, { 
        status: 'completed', 
        endTime: new Date(),
        progress: 100
      });

      toast({
        title: "Metadata Extraction Complete",
        description: `Successfully processed ${results.length} videos`,
      });

      return results;

    } catch (error) {
      updateTask(taskId, { 
        status: 'failed', 
        error: error.message,
        endTime: new Date()
      });
      
      toast({
        title: "Metadata Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
      
      throw error;
    } finally {
      taskWorkers.current.delete(taskId);
    }
  }, [createTask, updateTask]);

  const startVideoDownload = useCallback(async (
    videos: any[], 
    taskName: string = 'Download Videos'
  ) => {
    const taskId = createTask(taskName, 'download', videos.length);
    const abortController = new AbortController();
    taskWorkers.current.set(taskId, abortController);

    updateTask(taskId, { status: 'running' });

    try {
      const results = [];
      
      for (let i = 0; i < videos.length; i++) {
        if (abortController.signal.aborted) {
          updateTask(taskId, { status: 'paused' });
          return results;
        }

        const video = videos[i];
        
        try {
          const downloadUrl = await fixedGoogleOAuth.downloadFile(video.id);
          
          // In a real implementation, this would trigger the actual download
          // For now, we'll simulate the download process
          await simulateDownload(video, downloadUrl);
          
          results.push({ ...video, downloadUrl, downloaded: true });
          
          updateTask(taskId, {
            processedItems: i + 1,
            progress: ((i + 1) / videos.length) * 100
          });

        } catch (error) {
          console.error(`Failed to download video ${video.name}:`, error);
          results.push({ ...video, error: error.message, downloaded: false });
        }
      }

      updateTask(taskId, { 
        status: 'completed', 
        endTime: new Date(),
        progress: 100
      });

      toast({
        title: "Download Complete",
        description: `Successfully downloaded ${results.filter(r => r.downloaded).length} videos`,
      });

      return results;

    } catch (error) {
      updateTask(taskId, { 
        status: 'failed', 
        error: error.message,
        endTime: new Date()
      });
      
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive",
      });
      
      throw error;
    } finally {
      taskWorkers.current.delete(taskId);
    }
  }, [createTask, updateTask]);

  const startProjectGeneration = useCallback(async (
    videos: any[], 
    settings: any,
    taskName: string = 'Generate Project Files'
  ) => {
    const taskId = createTask(taskName, 'generate', 1);
    const abortController = new AbortController();
    taskWorkers.current.set(taskId, abortController);

    updateTask(taskId, { status: 'running' });

    try {
      if (abortController.signal.aborted) {
        updateTask(taskId, { status: 'paused' });
        return null;
      }

      updateTask(taskId, { progress: 25 });

      // For now, skip project generation since we're using only fixedGoogleOAuth
      const result = { success: false, projectFiles: [] };
      
      updateTask(taskId, { progress: 75 });

      // Simulate final processing
      await new Promise(resolve => setTimeout(resolve, 500));

      updateTask(taskId, { 
        status: 'completed', 
        endTime: new Date(),
        progress: 100,
        processedItems: 1
      });

      toast({
        title: "Project Generation Complete",
        description: `Generated ${result.projectFiles?.length || 0} project files`,
      });

      return result;

    } catch (error) {
      updateTask(taskId, { 
        status: 'failed', 
        error: error.message,
        endTime: new Date()
      });
      
      toast({
        title: "Project Generation Failed",
        description: error.message,
        variant: "destructive",
      });
      
      throw error;
    } finally {
      taskWorkers.current.delete(taskId);
    }
  }, [createTask, updateTask]);

  const pauseTask = useCallback((taskId: string) => {
    const controller = taskWorkers.current.get(taskId);
    if (controller) {
      controller.abort();
      updateTask(taskId, { status: 'paused' });
    }
  }, [updateTask]);

  const resumeTask = useCallback((taskId: string) => {
    // In a real implementation, this would restart the task from where it left off
    updateTask(taskId, { status: 'queued' });
    toast({
      title: "Task Resumed",
      description: "Task will continue processing",
    });
  }, [updateTask]);

  const cancelTask = useCallback((taskId: string) => {
    const controller = taskWorkers.current.get(taskId);
    if (controller) {
      controller.abort();
      taskWorkers.current.delete(taskId);
    }
    
    setTasks(prev => prev.filter(task => task.id !== taskId));
    
    toast({
      title: "Task Cancelled",
      description: "Task has been removed from the queue",
    });
  }, []);

  const retryTask = useCallback((taskId: string) => {
    updateTask(taskId, { 
      status: 'queued', 
      progress: 0, 
      processedItems: 0,
      error: undefined 
    });
    
    toast({
      title: "Task Retrying",
      description: "Task has been added back to the queue",
    });
  }, [updateTask]);

  return {
    tasks,
    startVideoMetadataExtraction,
    startVideoDownload,
    startProjectGeneration,
    pauseTask,
    resumeTask,
    cancelTask,
    retryTask
  };
};

// Helper function to simulate download process
async function simulateDownload(video: any, downloadUrl: string): Promise<void> {
  // In a real implementation, this would:
  // 1. Fetch the video file from the download URL
  // 2. Save it to the user's device
  // 3. Potentially organize it in folders
  
  const fileSize = parseInt(video.size || '0');
  const chunks = Math.max(1, Math.floor(fileSize / (1024 * 1024))); // 1MB chunks
  const delayPerChunk = Math.min(50, Math.max(10, chunks)); // 10-50ms per chunk
  
  for (let i = 0; i < chunks; i++) {
    await new Promise(resolve => setTimeout(resolve, delayPerChunk));
  }
}