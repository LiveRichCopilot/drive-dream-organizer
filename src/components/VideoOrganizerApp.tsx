import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Upload, 
  FolderOpen, 
  Video, 
  Calendar, 
  Clock, 
  Settings,
  Search,
  Grid3X3,
  List,
  Filter
} from "lucide-react";
import heroImage from "@/assets/hero-video-bg.jpg";

type ViewMode = "grid" | "list";

interface VideoFile {
  id: string;
  name: string;
  duration: string;
  size: string;
  dateCreated: string;
  thumbnail: string;
  format: string;
}

const VideoOrganizerApp = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");

  // Mock video data
  const mockVideos: VideoFile[] = [
    {
      id: "1",
      name: "Project_Demo_2024.mp4",
      duration: "15:42",
      size: "2.4 GB",
      dateCreated: "2024-01-15",
      thumbnail: "/api/placeholder/300/200",
      format: "MP4"
    },
    {
      id: "2", 
      name: "Meeting_Recording.mov",
      duration: "45:18",
      size: "5.2 GB", 
      dateCreated: "2024-01-14",
      thumbnail: "/api/placeholder/300/200",
      format: "MOV"
    },
    {
      id: "3",
      name: "Tutorial_Screen_Capture.avi",
      duration: "28:33",
      size: "1.8 GB",
      dateCreated: "2024-01-13", 
      thumbnail: "/api/placeholder/300/200",
      format: "AVI"
    }
  ];

  const handleConnect = () => {
    setIsLoading(true);
    setProgress(0);
    
    // Simulate connection progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsLoading(false);
          setIsConnected(true);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const filteredVideos = mockVideos.filter(video =>
    video.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {/* Background */}
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed'
          }}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        </div>

        {/* Hero Section */}
        <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="glass-card max-w-lg mx-auto">
              <div className="mb-6">
                <h1 className="text-3xl font-medium mb-4 text-foreground">
                  LiveRich Video Organizer
                </h1>
                <p className="text-base text-muted-foreground mb-6">
                  Organize your Google Drive videos with AI-powered sorting
                </p>
              </div>

              {isLoading ? (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-foreground">
                    Connecting to Google Drive...
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="text-xs text-muted-foreground">
                    {progress}% Complete
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <Button 
                    onClick={handleConnect}
                    variant="outline"
                    size="default"
                    className="text-sm px-6 py-2 h-10"
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Connect Google Drive
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="glass-card mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Video Library
          </h1>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="glass border-primary/30">
              <FolderOpen className="h-4 w-4 mr-2" />
              Connected
            </Badge>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search and Controls */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 glass border-primary/30"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Organize Videos
            </Button>
          </div>
        </div>
      </div>

      {/* Video Grid/List */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredVideos.map((video) => (
            <Card key={video.id} className="glass-card group cursor-pointer">
              <div className="aspect-video bg-muted rounded-xl mb-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-glass flex items-center justify-center">
                  <Play className="h-12 w-12 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
                <Badge className="absolute top-2 right-2 bg-background/80">
                  {video.format}
                </Badge>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold truncate">{video.name}</h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {video.duration}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {video.dateCreated}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {video.size}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVideos.map((video) => (
            <Card key={video.id} className="glass-card">
              <div className="flex items-center gap-4 p-6">
                <div className="w-24 h-16 bg-muted rounded-lg flex items-center justify-center">
                  <Play className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{video.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{video.duration}</span>
                    <span>{video.size}</span>
                    <span>{video.dateCreated}</span>
                    <Badge variant="outline" className="ml-auto">
                      {video.format}
                    </Badge>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Play className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {filteredVideos.length === 0 && (
        <div className="glass-card text-center py-12">
          <Video className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">No videos found</h3>
          <p className="text-muted-foreground mb-6">
            {searchQuery ? "Try adjusting your search terms" : "Connect your Google Drive to see videos"}
          </p>
          <Button variant="secondary">
            <Upload className="h-4 w-4 mr-2" />
            Upload Videos
          </Button>
        </div>
      )}
    </div>
  );
};

export default VideoOrganizerApp;