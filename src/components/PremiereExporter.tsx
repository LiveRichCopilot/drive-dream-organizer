import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileVideo } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface PremiereExporterProps {
  videos: {
    id: string;
    originalName: string;
    newName?: string;
    originalDate: Date;
    metadata: {
      duration: number;
      resolution: string;
      fps: number;
    };
  }[];
  onExport?: (type: 'original' | 'renamed') => void;
}

const PremiereExporter: React.FC<PremiereExporterProps> = ({ videos, onExport }) => {
  
  const generateFinalCutXML = (videosList: typeof videos, useRenamedFiles: boolean = false) => {
    // Sort videos chronologically by originalDate
    const sortedVideos = [...videosList].sort((a, b) => 
      new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime()
    );

    // Calculate frame rate and total duration
    const projectFrameRate = 30; // Standard frame rate
    let currentFrame = 0;

    // Generate unique IDs for XML
    const generateId = () => `r-${Math.random().toString(36).substr(2, 9)}`;

    // XML header
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
  <resources>
${sortedVideos.map(video => {
  const filename = useRenamedFiles ? video.newName || video.originalName : video.originalName;
  const fileId = generateId();
  return `    <asset id="${fileId}" name="${filename}" uid="${video.id}" start="0s" hasVideo="1" hasAudio="1" videoSources="1" audioSources="1" duration="${Math.round((video.metadata.duration / 1000) * projectFrameRate)}/${projectFrameRate}s" format="r2"/>`;
}).join('\n')}
    <format id="r2" name="FFVideoFormat1080p30" frameDuration="1001/30000s" fieldOrder="progressive" width="1920" height="1080" paspH="1" paspV="1" colorSpace="1-1-1 (Rec. 709)" projection="rectangular"/>
  </resources>
  <library location="file:///Users/user/Movies/">
    <event name="Video Organization Project" uid="${generateId()}">
      <project name="Chronological Timeline" uid="${generateId()}">
        <sequence duration="${Math.round(sortedVideos.reduce((total, video) => total + (video.metadata.duration / 1000), 0) * projectFrameRate)}/${projectFrameRate}s" format="r2" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${sortedVideos.map(video => {
  const filename = useRenamedFiles ? video.newName || video.originalName : video.originalName;
  const fileId = generateId();
  const videoDurationFrames = Math.round((video.metadata.duration / 1000) * projectFrameRate);
  const startFrame = currentFrame;
  currentFrame += videoDurationFrames;
  
  return `            <clip name="${filename}" lane="1" offset="${startFrame}/${projectFrameRate}s" duration="${videoDurationFrames}/${projectFrameRate}s" start="0s" format="r2">
              <asset-clip name="${filename}" ref="${fileId}" duration="${videoDurationFrames}/${projectFrameRate}s" start="0s" format="r2"/>
            </clip>`;
}).join('\n')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;

    return xml;
  };

  const formatFilename = (originalDate: Date): string => {
    const year = originalDate.getFullYear();
    const month = String(originalDate.getMonth() + 1).padStart(2, '0');
    const day = String(originalDate.getDate()).padStart(2, '0');
    const hours = String(originalDate.getHours()).padStart(2, '0');
    const minutes = String(originalDate.getMinutes()).padStart(2, '0');
    const seconds = String(originalDate.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
  };

  const downloadXML = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportOriginalNames = () => {
    try {
      const xml = generateFinalCutXML(videos, false);
      const filename = `Video_Timeline_Original_Names_${new Date().toISOString().slice(0, 10)}.fcpxml`;
      downloadXML(xml, filename);
      
      toast({
        title: "Export Complete",
        description: `Final Cut Pro XML exported with original filenames (${videos.length} clips)`,
      });
      
      onExport?.('original');
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Could not generate Final Cut Pro XML file",
        variant: "destructive",
      });
    }
  };

  const exportRenamedFiles = () => {
    try {
      // Create videos with date-based filenames
      const videosWithDateNames = videos.map(video => ({
        ...video,
        newName: formatFilename(video.originalDate) + '.' + (video.originalName.split('.').pop() || 'MOV')
      }));
      
      const xml = generateFinalCutXML(videosWithDateNames, true);
      const filename = `Video_Timeline_Date_Names_${new Date().toISOString().slice(0, 10)}.fcpxml`;
      downloadXML(xml, filename);
      
      toast({
        title: "Export Complete", 
        description: `Final Cut Pro XML exported with date-based filenames (${videos.length} clips)`,
      });
      
      onExport?.('renamed');
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Could not generate Final Cut Pro XML file",
        variant: "destructive",
      });
    }
  };

  if (videos.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <FileVideo className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Adobe Premiere Export</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button
          onClick={exportOriginalNames}
          variant="outline"
          className="glass text-white border-white/20 hover:bg-white/10 bg-white/5 h-auto py-4"
        >
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Download className="h-4 w-4" />
              <span className="font-medium">Export Premiere Project</span>
            </div>
            <div className="text-sm opacity-70">(Original Names)</div>
            <div className="text-xs opacity-50 mt-1">
              Final Cut Pro XML with original filenames
            </div>
          </div>
        </Button>

        <Button
          onClick={exportRenamedFiles}
          variant="outline"
          className="glass text-white border-white/20 hover:bg-white/10 bg-white/5 h-auto py-4"
        >
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Download className="h-4 w-4" />
              <span className="font-medium">Export Premiere Project</span>
            </div>
            <div className="text-sm opacity-70">(Renamed)</div>
            <div className="text-xs opacity-50 mt-1">
              Final Cut Pro XML with date-based filenames
            </div>
          </div>
        </Button>
      </div>
      
      <div className="text-xs text-muted-foreground bg-blue-50/10 border border-blue-200/20 rounded-lg p-3">
        <p className="text-blue-300">
          <strong>Note:</strong> Both exports create Final Cut Pro XML files (.fcpxml) that are compatible with Adobe Premiere Pro. 
          Videos are sorted chronologically by original shooting date and placed sequentially on the timeline.
        </p>
      </div>
    </div>
  );
};

export default PremiereExporter;