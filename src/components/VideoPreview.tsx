import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Play, Calendar, HardDrive, Clock } from 'lucide-react';

interface ProcessedVideo {
  id: string;
  originalName: string;
  newName: string;
  originalDate: Date;
  localPath: string;
  metadata: {
    duration: number;
    resolution: string;
    fileSize: number;
  };
}

interface VideoPreviewProps {
  videos: ProcessedVideo[];
  onConfirmUpload: () => void;
  onBack: () => void;
  projectName: string;
}

interface GroupedVideos {
  [dateKey: string]: ProcessedVideo[];
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  videos,
  onConfirmUpload,
  onBack,
  projectName
}) => {
  // Group videos by date
  const groupedVideos = videos.reduce((acc: GroupedVideos, video) => {
    const dateKey = video.originalDate.toDateString();
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(video);
    return acc;
  }, {});

  // Sort dates chronologically
  const sortedDates = Object.keys(groupedVideos).sort((a, b) => 
    new Date(a).getTime() - new Date(b).getTime()
  );

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    });
  };

  const totalDuration = videos.reduce((acc, video) => acc + video.metadata.duration, 0);
  const daysCovered = sortedDates.length;
  const totalSize = videos.reduce((acc, video) => acc + video.metadata.fileSize, 0);

  return (
    <div className="glass-card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Processing
          </Button>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{projectName}</h2>
            <p className="text-muted-foreground">Project timeline and details</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="glass">
            ✓ completed
          </Badge>
          <Button 
            onClick={onConfirmUpload}
            variant="glass"
            className="hover:scale-105 transition-transform"
          >
            <Download className="h-4 w-4 mr-2" />
            Upload Organized Videos
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-3xl font-bold text-foreground">{videos.length}</div>
          <div className="text-sm text-muted-foreground">Total Videos</div>
          <div className="text-xs text-muted-foreground mt-1">Organized chronologically</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-3xl font-bold text-foreground">{formatDuration(totalDuration)}</div>
          <div className="text-sm text-muted-foreground">Total Duration</div>
          <div className="text-xs text-muted-foreground mt-1">Ready for editing</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-3xl font-bold text-foreground">{daysCovered}</div>
          <div className="text-sm text-muted-foreground">Days Covered</div>
          <div className="text-xs text-muted-foreground mt-1">Date-based organization</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-3xl font-bold text-foreground">{formatFileSize(totalSize)}</div>
          <div className="text-sm text-muted-foreground">Total Size</div>
          <div className="text-xs text-muted-foreground mt-1">Ready for upload</div>
        </div>
      </div>

      {/* Success Message */}
      <div className="glass-card p-4 bg-teal-500/10 border-teal-500/30">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-teal-500/20 flex items-center justify-center">
            <span className="text-teal-400 text-sm">✓</span>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Organization Complete!</h3>
            <p className="text-sm text-muted-foreground">
              Your videos are now perfectly organized chronologically and ready for Adobe Premiere. All subfolders have been scanned and processed.
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-r from-teal-500 to-pink-500 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Chronological Timeline</h3>
            <p className="text-sm text-muted-foreground">Videos organized by recording date and time</p>
          </div>
        </div>

        <div className="space-y-6">
          {sortedDates.map((dateKey, dateIndex) => {
            const dateVideos = groupedVideos[dateKey].sort((a, b) => 
              a.originalDate.getTime() - b.originalDate.getTime()
            );
            
            return (
              <div key={dateKey} className="space-y-4">
                {/* Date Header */}
                <div className="flex items-center gap-4">
                  <div className="h-3 w-3 rounded-full bg-gradient-to-r from-teal-500 to-pink-500"></div>
                  <div className="flex-1 h-px bg-border"></div>
                  <div className="glass-card px-4 py-2 bg-muted/20">
                    <div className="font-medium text-foreground">{formatDate(dateKey)}</div>
                    <div className="text-xs text-muted-foreground">{dateVideos.length} videos</div>
                  </div>
                </div>

                {/* Videos for this date */}
                <div className="space-y-3 ml-6">
                  {dateVideos.map((video, index) => (
                    <div key={video.id} className="glass-card p-4 hover:bg-muted/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-pink-500 to-teal-500 flex items-center justify-center text-white font-bold">
                          #{index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-muted-foreground">
                              {formatTime(video.originalDate)}
                            </span>
                            <span className="font-mono text-foreground">{video.newName}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{formatDuration(video.metadata.duration)}</span>
                            <span>•</span>
                            <span>{formatFileSize(video.metadata.fileSize)}</span>
                            <span>•</span>
                            <span>{video.metadata.resolution}</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          QUICKTIME
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};