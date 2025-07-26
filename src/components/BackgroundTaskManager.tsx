import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Play, 
  Pause, 
  Square, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Loader2
} from 'lucide-react';
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

interface BackgroundTaskManagerProps {
  tasks: BackgroundTask[];
  onPauseTask: (taskId: string) => void;
  onResumeTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
}

const BackgroundTaskManager: React.FC<BackgroundTaskManagerProps> = ({
  tasks,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onRetryTask
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const activeTasks = tasks.filter(task => 
    task.status === 'running' || task.status === 'queued' || task.status === 'paused'
  );
  
  const completedTasks = tasks.filter(task => 
    task.status === 'completed' || task.status === 'failed'
  );

  const getTaskIcon = (task: BackgroundTask) => {
    switch (task.status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTaskStatusColor = (status: BackgroundTask['status']) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (startTime: Date, endTime?: Date) => {
    const end = endTime || new Date();
    const diff = end.getTime() - startTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const getTaskTypeLabel = (type: BackgroundTask['type']) => {
    switch (type) {
      case 'download':
        return 'Downloading';
      case 'metadata':
        return 'Extracting Metadata';
      case 'organize':
        return 'Organizing';
      case 'generate':
        return 'Generating Projects';
      default:
        return 'Processing';
    }
  };

  if (tasks.length === 0) return null;

  return (
    <Card className="fixed bottom-4 right-4 w-96 max-h-96 overflow-hidden shadow-lg z-50">
      <CardHeader 
        className="cursor-pointer pb-2" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span>Background Tasks</span>
            {activeTasks.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeTasks.length} active
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {isExpanded ? '−' : '+'}
          </Button>
        </CardTitle>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0 max-h-80 overflow-y-auto">
          <div className="space-y-3">
            {/* Active Tasks */}
            {activeTasks.map(task => (
              <div key={task.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getTaskIcon(task)}
                    <span className="font-medium text-sm">{task.name}</span>
                  </div>
                  <Badge className={`text-xs ${getTaskStatusColor(task.status)}`}>
                    {task.status}
                  </Badge>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  {getTaskTypeLabel(task.type)} • {task.processedItems}/{task.totalItems} items
                </div>
                
                <Progress value={task.progress} className="h-1" />
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {formatDuration(task.startTime)}
                  </span>
                  <div className="flex gap-1">
                    {task.status === 'running' && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 w-6 p-0"
                        onClick={() => onPauseTask(task.id)}
                      >
                        <Pause className="h-3 w-3" />
                      </Button>
                    )}
                    {task.status === 'paused' && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 w-6 p-0"
                        onClick={() => onResumeTask(task.id)}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0 text-red-600"
                      onClick={() => onCancelTask(task.id)}
                    >
                      <Square className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Recent Completed Tasks */}
            {completedTasks.slice(-3).map(task => (
              <div key={task.id} className="border rounded-lg p-3 opacity-75">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getTaskIcon(task)}
                    <span className="font-medium text-sm">{task.name}</span>
                  </div>
                  <Badge className={`text-xs ${getTaskStatusColor(task.status)}`}>
                    {task.status}
                  </Badge>
                </div>
                
                <div className="text-xs text-muted-foreground mt-1">
                  {task.status === 'completed' 
                    ? `Completed ${task.totalItems} items`
                    : task.error
                  }
                </div>
                
                {task.status === 'failed' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="mt-2 h-6 text-xs"
                    onClick={() => onRetryTask(task.id)}
                  >
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default BackgroundTaskManager;