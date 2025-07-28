import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  FolderOpen, 
  Plus, 
  Trash2, 
  Calendar, 
  FileVideo, 
  Folders,
  Clock,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { useProjectMemory } from '@/hooks/useProjectMemory';
import { toast } from '@/hooks/use-toast';

interface ProjectMemoryManagerProps {
  onProjectSelected: (projectId: string) => void;
  selectedVideos: any[];
  folderId?: string;
}

const ProjectMemoryManager: React.FC<ProjectMemoryManagerProps> = ({ 
  onProjectSelected, 
  selectedVideos,
  folderId 
}) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [batchAnalysis, setBatchAnalysis] = useState<{
    newFiles: string[];
    alreadyProcessed: string[];
    batchMessage: string;
    videosByDate: Map<string, any[]>;
  } | null>(null);

  const {
    currentProject,
    createProject,
    loadCurrentProject,
    checkProcessedFiles,
    getBatchStatusMessage,
    getProjectStats,
    clearProject,
    listProjects
  } = useProjectMemory();

  const [projects, setProjects] = useState(listProjects());
  const [stats, setStats] = useState(getProjectStats());

  useEffect(() => {
    loadCurrentProject();
  }, [loadCurrentProject]);

  useEffect(() => {
    setProjects(listProjects());
    setStats(getProjectStats());
  }, [currentProject, listProjects, getProjectStats]);

  // Analyze current batch when videos change
  useEffect(() => {
    if (selectedVideos.length > 0) {
      const fileIds = selectedVideos.map(v => v.id);
      const analysis = checkProcessedFiles(fileIds);
      
      // Group videos by date for batch message
      const videosByDate = new Map<string, any[]>();
      selectedVideos.forEach(video => {
        // For now, we'll estimate date grouping - in real implementation this would use extracted metadata
        const dateKey = new Date().toISOString().slice(0, 7); // Current month as placeholder
        if (!videosByDate.has(dateKey)) {
          videosByDate.set(dateKey, []);
        }
        videosByDate.get(dateKey)!.push(video);
      });

      const batchNumber = currentProject ? currentProject.totalBatches + 1 : 1;
      const batchMessage = getBatchStatusMessage(analysis.newFiles, batchNumber, videosByDate);

      setBatchAnalysis({
        ...analysis,
        batchMessage,
        videosByDate
      });
    }
  }, [selectedVideos, currentProject, checkProcessedFiles, getBatchStatusMessage]);

  const handleCreateProject = () => {
    if (!projectName.trim()) {
      toast({
        title: "Project Name Required",
        description: "Please enter a name for your project",
        variant: "destructive",
      });
      return;
    }

    const project = createProject(projectName.trim(), folderId);
    onProjectSelected(project.id);
    setProjectName('');
    setIsCreateDialogOpen(false);
  };

  const handleLoadProject = (projectId: string) => {
    onProjectSelected(projectId);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Project Stats Overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <BarChart3 className="h-5 w-5" />
            Project Statistics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.totalProjects}</div>
              <div className="text-sm text-white/70">Projects</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.totalFilesProcessed}</div>
              <div className="text-sm text-white/70">Files Processed</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.totalFoldersCreated}</div>
              <div className="text-sm text-white/70">Folders Created</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-2xl font-bold text-white">
                {currentProject ? currentProject.totalBatches : 0}
              </div>
              <div className="text-sm text-white/70">Batches</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Project */}
      {currentProject && (
        <Card className="glass-card border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Current Project: {currentProject.name}
              </div>
              <Badge variant="secondary">Active</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-white/70">Started</div>
                <div className="text-white">{formatDate(currentProject.startDate)}</div>
              </div>
              <div>
                <div className="text-white/70">Last Updated</div>
                <div className="text-white">{formatDate(currentProject.lastUpdated)}</div>
              </div>
              <div>
                <div className="text-white/70">Files Processed</div>
                <div className="text-white">{currentProject.totalFilesProcessed}</div>
              </div>
            </div>

            {/* Date Folders */}
            {currentProject.dateFolders.size > 0 && (
              <div>
                <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                  <Folders className="h-4 w-4" />
                  Date Folders ({currentProject.dateFolders.size})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Array.from(currentProject.dateFolders.entries()).map(([dateKey, folderInfo]) => {
                    const monthYear = new Date(dateKey + '-01').toLocaleDateString('en', { 
                      month: 'long', 
                      year: 'numeric' 
                    });
                    return (
                      <div key={dateKey} className="glass-card p-3 flex justify-between items-center">
                        <div>
                          <div className="text-white text-sm font-medium">{monthYear}</div>
                          <div className="text-white/70 text-xs">
                            {folderInfo.videoCount} videos • Batch {folderInfo.batchesContributed.join(', ')}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {folderInfo.videoCount}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => clearProject()}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear Project
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Analysis */}
      {batchAnalysis && selectedVideos.length > 0 && (
        <Card className="glass-card border-blue-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <RefreshCw className="h-5 w-5" />
              Batch Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-white font-medium">{batchAnalysis.batchMessage}</div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileVideo className="h-4 w-4 text-green-400" />
                  <span className="text-white/70 text-sm">New Files</span>
                </div>
                <div className="text-2xl font-bold text-white">{batchAnalysis.newFiles.length}</div>
              </div>
              
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-yellow-400" />
                  <span className="text-white/70 text-sm">Already Processed</span>
                </div>
                <div className="text-2xl font-bold text-white">{batchAnalysis.alreadyProcessed.length}</div>
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  <span className="text-white/70 text-sm">Date Groups</span>
                </div>
                <div className="text-2xl font-bold text-white">{batchAnalysis.videosByDate.size}</div>
              </div>
            </div>

            {batchAnalysis.alreadyProcessed.length > 0 && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="text-yellow-400 text-sm font-medium mb-1">
                  ⚠️ Duplicate Files Detected
                </div>
                <div className="text-white/70 text-sm">
                  {batchAnalysis.alreadyProcessed.length} files have already been processed in this project and will be skipped.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Project Management */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Projects
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-card border-white/20">
                <DialogHeader>
                  <DialogTitle className="text-white">Create New Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="projectName" className="text-white">Project Name</Label>
                    <Input
                      id="projectName"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="e.g., Summer Vacation 2024"
                      className="mt-1"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateProject}>
                      Create Project
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="text-center py-8 text-white/70">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <div>No projects yet. Create your first project to get started.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={`glass-card p-4 cursor-pointer transition-colors hover:bg-white/5 ${
                    currentProject?.id === project.id ? 'border-primary/50' : ''
                  }`}
                  onClick={() => handleLoadProject(project.id)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-white font-medium">{project.name}</div>
                      <div className="text-white/70 text-sm">
                        {project.totalFiles} files • Updated {formatDate(project.lastUpdated)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {currentProject?.id === project.id && (
                        <Badge variant="secondary" className="text-xs">Active</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {project.totalFiles}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectMemoryManager;