import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Scissors } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface CapCutExporterProps {
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

const CapCutExporter: React.FC<CapCutExporterProps> = ({ videos, onExport }) => {
  
  const generateCapCutProject = (videosList: typeof videos, useRenamedFiles: boolean = false) => {
    // Sort videos chronologically by originalDate
    const sortedVideos = [...videosList].sort((a, b) => 
      new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime()
    );

    // Calculate timeline positions
    let currentTimeMs = 0;
    const tracks = [];

    // Generate CapCut project structure
    const project = {
      "draft_fold": "CapCut_draft",
      "draft_id": `draft_${Date.now()}`,
      "draft_name": "Video_Organization_Timeline",
      "version": "5.2.0",
      "create_time": Date.now(),
      "update_time": Date.now(),
      "timeline": {
        "duration": sortedVideos.reduce((total, video) => total + video.metadata.duration, 0) * 1000, // microseconds
        "fps": 30,
        "scale": 1.0,
        "tracks": [
          {
            "attribute": 0,
            "flag": 0,
            "id": "track_video_main",
            "segments": sortedVideos.map((video, index) => {
              const filename = useRenamedFiles ? video.newName || video.originalName : video.originalName;
              const startTime = currentTimeMs;
              const duration = video.metadata.duration * 1000; // Convert to microseconds
              currentTimeMs += duration;
              
              return {
                "cartoon": false,
                "clip": {
                  "alpha": 1.0,
                  "flip": {
                    "horizontal": false,
                    "vertical": false
                  },
                  "rotation": 0.0,
                  "scale": {
                    "x": 1.0,
                    "y": 1.0
                  },
                  "transform": {
                    "x": 0.0,
                    "y": 0.0
                  }
                },
                "common_keyframes": [],
                "enable_adjust": true,
                "enable_color_correct": true,
                "enable_color_curves": true,
                "enable_color_wheels": true,
                "enable_lut": true,
                "enable_smart_color_correct": false,
                "extra_material_refs": [],
                "group_id": "",
                "hdr_settings": null,
                "id": `segment_${index}`,
                "intensifies_audio": false,
                "is_placeholder": false,
                "is_tone_modify": false,
                "keyframe_refs": [],
                "last_nonzero_volume": 1.0,
                "material_id": `material_${index}`,
                "render_index": 0,
                "reverse": false,
                "source_timerange": {
                  "duration": duration,
                  "start": 0
                },
                "speed": 1.0,
                "target_timerange": {
                  "duration": duration,
                  "start": startTime
                },
                "template_id": "",
                "template_scene": "default",
                "track_attribute": 0,
                "track_render_index": 0,
                "uniform_scale": {
                  "on": true,
                  "value": 1.0
                },
                "visible": true,
                "volume": 1.0
              };
            }),
            "type": "video"
          }
        ]
      },
      "materials": {
        "videos": sortedVideos.map((video, index) => {
          const filename = useRenamedFiles ? video.newName || video.originalName : video.originalName;
          return {
            "create_time": Date.now(),
            "duration": video.metadata.duration * 1000,
            "extra_info": "",
            "file_Path": `/path/to/videos/${filename}`,
            "height": 1080,
            "id": `material_${index}`,
            "import_time": Date.now(),
            "import_time_ms": Date.now(),
            "md5": "",
            "metetype": "video",
            "roughcut_time_range": {
              "duration": video.metadata.duration * 1000,
              "start": 0
            },
            "sub_time_range": {
              "duration": video.metadata.duration * 1000,
              "start": 0
            },
            "type": "video",
            "url": "",
            "user_data": "",
            "width": 1920
          };
        })
      },
      "export_range": {
        "duration": sortedVideos.reduce((total, video) => total + video.metadata.duration, 0) * 1000,
        "start": 0
      }
    };

    return JSON.stringify(project, null, 2);
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

  const downloadProject = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
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
      const project = generateCapCutProject(videos, false);
      const filename = `Video_Timeline_Original_Names_${new Date().toISOString().slice(0, 10)}.ccp`;
      downloadProject(project, filename);
      
      toast({
        title: "Export Complete",
        description: `CapCut project exported with original filenames (${videos.length} clips)`,
      });
      
      onExport?.('original');
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Could not generate CapCut project file",
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
      
      const project = generateCapCutProject(videosWithDateNames, true);
      const filename = `Video_Timeline_Date_Names_${new Date().toISOString().slice(0, 10)}.ccp`;
      downloadProject(project, filename);
      
      toast({
        title: "Export Complete", 
        description: `CapCut project exported with date-based filenames (${videos.length} clips)`,
      });
      
      onExport?.('renamed');
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Could not generate CapCut project file",
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
        <Scissors className="h-5 w-5" />
        <h3 className="text-lg font-semibold">CapCut Export</h3>
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
              <span className="font-medium">Export CapCut Project</span>
            </div>
            <div className="text-sm opacity-70">(Original Names)</div>
            <div className="text-xs opacity-50 mt-1">
              CapCut project file with original filenames
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
              <span className="font-medium">Export CapCut Project</span>
            </div>
            <div className="text-sm opacity-70">(Renamed)</div>
            <div className="text-xs opacity-50 mt-1">
              CapCut project file with date-based filenames
            </div>
          </div>
        </Button>
      </div>
      
      <div className="text-xs text-muted-foreground bg-purple-50/10 border border-purple-200/20 rounded-lg p-3">
        <p className="text-purple-300">
          <strong>Note:</strong> Both exports create CapCut project files (.ccp) that can be imported directly into CapCut. 
          Videos are sorted chronologically by original shooting date and placed sequentially on the timeline.
        </p>
      </div>
    </div>
  );
};

export default CapCutExporter;