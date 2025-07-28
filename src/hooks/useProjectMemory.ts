import { useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface ProjectMemory {
  id: string;
  name: string;
  startDate: Date;
  lastUpdated: Date;
  processedFiles: Set<string>; // File IDs that have been processed
  dateFolders: Map<string, DateFolderInfo>; // Date string -> folder info
  totalBatches: number;
  totalFilesProcessed: number;
  sourceFolderId?: string;
}

interface DateFolderInfo {
  folderName: string; // e.g., "Videos_2023_01"
  googleDriveFolderId?: string; // Google Drive folder ID if created
  videoCount: number;
  firstCreated: Date;
  lastUpdated: Date;
  batchesContributed: number[]; // Which batch numbers added videos to this folder
}

interface ProjectStats {
  totalProjects: number;
  currentProject?: ProjectMemory;
  totalFilesProcessed: number;
  totalFoldersCreated: number;
}

const PROJECT_STORAGE_KEY = 'video_organizer_project_memory';
const CURRENT_PROJECT_KEY = 'video_organizer_current_project';

export const useProjectMemory = () => {
  const [currentProject, setCurrentProject] = useState<ProjectMemory | null>(null);

  // Load project from localStorage
  const loadProject = useCallback((projectId: string): ProjectMemory | null => {
    try {
      const storedData = localStorage.getItem(`${PROJECT_STORAGE_KEY}_${projectId}`);
      if (!storedData) return null;

      const data = JSON.parse(storedData);
      return {
        ...data,
        startDate: new Date(data.startDate),
        lastUpdated: new Date(data.lastUpdated),
        processedFiles: new Set(data.processedFiles),
        dateFolders: new Map(
          Object.entries(data.dateFolders).map(([date, folderInfo]: [string, any]) => [
            date,
            {
              ...folderInfo,
              firstCreated: new Date(folderInfo.firstCreated),
              lastUpdated: new Date(folderInfo.lastUpdated),
            }
          ])
        )
      };
    } catch (error) {
      console.error('Failed to load project:', error);
      return null;
    }
  }, []);

  // Save project to localStorage
  const saveProject = useCallback((project: ProjectMemory) => {
    try {
      const dataToStore = {
        ...project,
        processedFiles: Array.from(project.processedFiles),
        dateFolders: Object.fromEntries(
          Array.from(project.dateFolders.entries()).map(([date, folderInfo]) => [
            date,
            {
              ...folderInfo,
              firstCreated: folderInfo.firstCreated.toISOString(),
              lastUpdated: folderInfo.lastUpdated.toISOString(),
            }
          ])
        ),
        startDate: project.startDate.toISOString(),
        lastUpdated: project.lastUpdated.toISOString(),
      };

      localStorage.setItem(`${PROJECT_STORAGE_KEY}_${project.id}`, JSON.stringify(dataToStore));
      localStorage.setItem(CURRENT_PROJECT_KEY, project.id);
    } catch (error) {
      console.error('Failed to save project:', error);
      throw new Error('Failed to save project memory');
    }
  }, []);

  // Create a new project
  const createProject = useCallback((name: string, sourceFolderId?: string): ProjectMemory => {
    const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newProject: ProjectMemory = {
      id: projectId,
      name,
      startDate: new Date(),
      lastUpdated: new Date(),
      processedFiles: new Set(),
      dateFolders: new Map(),
      totalBatches: 0,
      totalFilesProcessed: 0,
      sourceFolderId
    };

    saveProject(newProject);
    setCurrentProject(newProject);

    toast({
      title: "New Project Created",
      description: `Started project: ${name}`,
    });

    return newProject;
  }, [saveProject]);

  // Load current project from localStorage
  const loadCurrentProject = useCallback(() => {
    try {
      const currentProjectId = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (!currentProjectId) return null;

      const project = loadProject(currentProjectId);
      setCurrentProject(project);
      return project;
    } catch (error) {
      console.error('Failed to load current project:', error);
      return null;
    }
  }, [loadProject]);

  // Check if files have been processed
  const checkProcessedFiles = useCallback((fileIds: string[]): {
    newFiles: string[];
    alreadyProcessed: string[];
    existingFolders: Map<string, DateFolderInfo>;
  } => {
    if (!currentProject) {
      return {
        newFiles: fileIds,
        alreadyProcessed: [],
        existingFolders: new Map()
      };
    }

    const newFiles = fileIds.filter(id => !currentProject.processedFiles.has(id));
    const alreadyProcessed = fileIds.filter(id => currentProject.processedFiles.has(id));

    return {
      newFiles,
      alreadyProcessed,
      existingFolders: currentProject.dateFolders
    };
  }, [currentProject]);

  // Add processed files to project memory
  const addProcessedFiles = useCallback((processedVideos: Array<{
    id: string;
    originalDate: Date;
    folderName: string;
    googleDriveFolderId?: string;
  }>) => {
    if (!currentProject) return;

    const updatedProject = { ...currentProject };
    updatedProject.totalBatches += 1;
    updatedProject.lastUpdated = new Date();

    // Track processed files
    processedVideos.forEach(video => {
      updatedProject.processedFiles.add(video.id);
      updatedProject.totalFilesProcessed += 1;

      // Create date key (YYYY-MM format)
      const dateKey = `${video.originalDate.getFullYear()}-${String(video.originalDate.getMonth() + 1).padStart(2, '0')}`;
      
      const existingFolder = updatedProject.dateFolders.get(dateKey);
      if (existingFolder) {
        // Update existing folder
        existingFolder.videoCount += 1;
        existingFolder.lastUpdated = new Date();
        if (!existingFolder.batchesContributed.includes(updatedProject.totalBatches)) {
          existingFolder.batchesContributed.push(updatedProject.totalBatches);
        }
        if (video.googleDriveFolderId && !existingFolder.googleDriveFolderId) {
          existingFolder.googleDriveFolderId = video.googleDriveFolderId;
        }
      } else {
        // Create new folder entry
        updatedProject.dateFolders.set(dateKey, {
          folderName: video.folderName,
          googleDriveFolderId: video.googleDriveFolderId,
          videoCount: 1,
          firstCreated: new Date(),
          lastUpdated: new Date(),
          batchesContributed: [updatedProject.totalBatches]
        });
      }
    });

    saveProject(updatedProject);
    setCurrentProject(updatedProject);
  }, [currentProject, saveProject]);

  // Generate batch status message
  const getBatchStatusMessage = useCallback((
    newFiles: string[],
    batchNumber: number,
    videosByDate: Map<string, any[]>
  ): string => {
    if (!currentProject) {
      return `Batch ${batchNumber}: Processing ${newFiles.length} videos`;
    }

    const messages: string[] = [];
    let newFolders = 0;
    let existingFolders = 0;

    videosByDate.forEach((videos, dateKey) => {
      const existingFolder = currentProject.dateFolders.get(dateKey);
      if (existingFolder) {
        const monthYear = new Date(dateKey + '-01').toLocaleDateString('en', { month: 'short', year: 'numeric' });
        messages.push(`Adding ${videos.length} videos to existing ${monthYear} folder`);
        existingFolders++;
      } else {
        newFolders++;
      }
    });

    if (messages.length > 0 && existingFolders > 0) {
      return `Batch ${batchNumber}: ${messages.join(' • ')}`;
    } else if (newFolders > 0) {
      return `Batch ${batchNumber}: Creating ${newFolders} new date folders for ${newFiles.length} videos`;
    } else {
      return `Batch ${batchNumber}: Processing ${newFiles.length} videos`;
    }
  }, [currentProject]);

  // Get project statistics
  const getProjectStats = useCallback((): ProjectStats => {
    const allProjectIds = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PROJECT_STORAGE_KEY + '_')) {
        allProjectIds.push(key.replace(PROJECT_STORAGE_KEY + '_', ''));
      }
    }

    let totalFilesProcessed = 0;
    let totalFoldersCreated = 0;

    allProjectIds.forEach(projectId => {
      const project = loadProject(projectId);
      if (project) {
        totalFilesProcessed += project.totalFilesProcessed;
        totalFoldersCreated += project.dateFolders.size;
      }
    });

    return {
      totalProjects: allProjectIds.length,
      currentProject,
      totalFilesProcessed,
      totalFoldersCreated
    };
  }, [currentProject, loadProject]);

  // Clear project memory
  const clearProject = useCallback((projectId?: string) => {
    const idToClear = projectId || currentProject?.id;
    if (!idToClear) return;

    localStorage.removeItem(`${PROJECT_STORAGE_KEY}_${idToClear}`);
    if (!projectId) {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
      setCurrentProject(null);
    }

    toast({
      title: "Project Cleared",
      description: "Project memory has been reset",
    });
  }, [currentProject]);

  // List all projects
  const listProjects = useCallback((): Array<{ id: string; name: string; lastUpdated: Date; totalFiles: number }> => {
    const projects = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PROJECT_STORAGE_KEY + '_')) {
        const projectId = key.replace(PROJECT_STORAGE_KEY + '_', '');
        const project = loadProject(projectId);
        if (project) {
          projects.push({
            id: project.id,
            name: project.name,
            lastUpdated: project.lastUpdated,
            totalFiles: project.totalFilesProcessed
          });
        }
      }
    }
    return projects.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }, [loadProject]);

  return {
    currentProject,
    createProject,
    loadCurrentProject,
    checkProcessedFiles,
    addProcessedFiles,
    getBatchStatusMessage,
    getProjectStats,
    clearProject,
    listProjects,
    loadProject,
    setCurrentProject
  };
};