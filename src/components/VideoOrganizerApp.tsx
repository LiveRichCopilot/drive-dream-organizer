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
  Filter,
  Download,
  Edit2,
  LogOut,
  Cog,
  Camera,
  MapPin,
  Building2,
  Film,
  Smartphone,
  Lock,
  Mic,
  GraduationCap,
  Users,
  Home
} from "lucide-react";
import heroImage from "@/assets/hero-video-bg.jpg";
import { useGoogleDrive } from "@/hooks/useGoogleDrive";
import { apiClient } from "@/lib/api";
import GoogleDriveFolderInput from "@/components/GoogleDriveFolderInput";
import VideoProcessor from "./VideoProcessor";
import ProcessingResults from "./ProcessingResults";
import BackgroundTaskManager from "./BackgroundTaskManager";
import { useBackgroundTasks } from "@/hooks/useBackgroundTasks";

type ViewMode = "grid" | "list";

const VideoOrganizerApp = () => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();
  const [showProcessor, setShowProcessor] = useState(false);
  const [processingResults, setProcessingResults] = useState<any>(null);
  
  const backgroundTasks = useBackgroundTasks();
  
  const {
    isConnected,
    isLoading,
    videos,
    progress,
    connect,
    loadVideos,
    downloadVideo,
    renameVideo,
    organizeVideos,
    disconnect,
  } = useGoogleDrive(selectedFolderId);
  
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);

  const filteredVideos = videos.filter(video =>
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
          <div className="text-center max-w-4xl mx-auto">
            <div className="glass-card max-w-2xl mx-auto">
              <div className="mb-8">
                <h1 className="text-4xl font-semibold mb-4 text-white">
                  LiveRich Video Organizer
                </h1>
                <p className="text-xl text-white/80 mb-8">
                  Seamlessly organize, analyze, and manage your Google Drive videos with AI-powered chronological sorting and beautiful glassmorphism interface.
                </p>
              </div>

              {isLoading ? (
                <div className="space-y-6">
                  <div className="text-lg font-medium text-primary">
                    Connecting to Google Drive...
                  </div>
                  <Progress value={progress} className="h-3" />
                  <div className="text-sm text-muted-foreground">
                    {progress}% Complete
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <Button 
                    onClick={connect}
                    variant="outline"
                    className="glass text-white border-white/20 hover:bg-white/10 bg-transparent"
                  >
                    <FolderOpen className="mr-3 h-6 w-6" />
                    Connect Google Drive
                  </Button>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                    <div className="glass-card text-center p-4">
                      <Video className="h-8 w-8 mx-auto mb-3 text-primary" />
                      <h3 className="font-semibold mb-2">Smart Organization</h3>
                      <p className="text-sm text-muted-foreground">
                        Automatically sort videos by creation date and metadata
                      </p>
                    </div>
                    <div className="glass-card text-center p-4">
                      <Calendar className="h-8 w-8 mx-auto mb-3 text-secondary" />
                      <h3 className="font-semibold mb-2">Timeline Generation</h3>
                      <p className="text-sm text-muted-foreground">
                        Create CapCut & Premiere Pro timelines with proper sequencing
                      </p>
                    </div>
                    <div className="glass-card text-center p-4">
                      <Settings className="h-8 w-8 mx-auto mb-3 text-accent" />
                      <h3 className="font-semibold mb-2">Metadata Extraction</h3>
                      <p className="text-sm text-muted-foreground">
                        Extract duration, resolution, and timestamp data
                      </p>
                    </div>
                  </div>
                  
                  {/* Who Benefits Section */}
                  <div className="mt-16 max-w-4xl mx-auto">
                    <h2 className="text-2xl font-semibold text-white text-center mb-12">Who benefits?</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <Camera className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Wedding & Event Videographers</h3>
                          <p className="text-sm text-white/70">Hours of footage become perfectly sequenced</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <MapPin className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Travel Vloggers & Adventurers</h3>
                          <p className="text-sm text-white/70">Trips sorted by the actual shot date</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Corporate Storytellers</h3>
                          <p className="text-sm text-white/70">Brand videos arranged in logical order</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <Film className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Documentary & Indie Film Producers</h3>
                          <p className="text-sm text-white/70">Multi-day shoots auto-organised</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <Smartphone className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Social Media Creators</h3>
                          <p className="text-sm text-white/70">Batch clips ready for editing on YouTube, TikTok & Reels</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <Lock className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Subscription Platforms</h3>
                          <p className="text-sm text-white/70">Episodes organised for OFTV, Patreon & paying subscribers</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <Mic className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Podcasters & Vodcast Teams</h3>
                          <p className="text-sm text-white/70">Audio/video aligned by capture time</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <GraduationCap className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Educators & Course Creators</h3>
                          <p className="text-sm text-white/70">Lessons and demos stay in sequence</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <Users className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Family Archivists</h3>
                          <p className="text-sm text-white/70">Home videos and photos preserved in order</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-4">
                        <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center flex-shrink-0">
                          <Home className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white mb-1">Real Estate & Property Marketers</h3>
                          <p className="text-sm text-white/70">Room-by-room footage turned into walkthroughs</p>
                        </div>
                      </div>
                    </div>
                  </div>
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
              Connected ({videos.length} videos)
            </Badge>
            <Button variant="outline" size="sm" onClick={() => { setSelectedFolderId(undefined); disconnect(); }} className="glass border-destructive/30 text-destructive hover:bg-destructive/10">
              <LogOut className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
          </div>
        </div>

        {/* Folder Selection */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-lg font-semibold">Select Folder (Optional)</h2>
            <Button 
              onClick={() => setShowFolderInput(!showFolderInput)}
              variant="ghost"
              size="sm"
            >
              <Settings className="mr-2 h-4 w-4" />
              {showFolderInput ? "Hide" : "Show"} Folder Selection
            </Button>
          </div>
          
          {showFolderInput && (
            <div className="mb-6">
              <GoogleDriveFolderInput 
                onFolderSelected={(folderId) => {
                  console.log('Folder selected:', folderId);
                  setSelectedFolderId(folderId);
                  // Load videos immediately with the specific folder ID
                  loadVideos(folderId);
                }}
              />
            </div>
          )}
        </div>

        {/* Processing Pipeline */}
        {videos.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Video Processing Pipeline</h2>
              <Button 
                onClick={() => setShowProcessor(!showProcessor)}
                variant="outline"
                size="sm"
              >
                <Cog className="mr-2 h-4 w-4" />
                {showProcessor ? "Hide" : "Show"} Processor
              </Button>
            </div>
            
            {showProcessor && !processingResults && (
              <VideoProcessor 
                videos={filteredVideos}
                folderId={selectedFolderId}
                onProcessingComplete={(results) => {
                  setProcessingResults(results);
                  setShowProcessor(false);
                }}
              />
            )}
            
            {processingResults && (
              <ProcessingResults 
                results={processingResults}
                onStartNew={() => {
                  setProcessingResults(null);
                  setShowProcessor(true);
                }}
              />
            )}
          </div>
        )}

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
            <Button variant="glass" size="sm" onClick={organizeVideos}>
              <Calendar className="h-4 w-4 mr-2" />
              Organize by Date
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
                {video.thumbnail && video.thumbnail !== '/api/placeholder/300/200' ? (
                  <img 
                    src={video.thumbnail} 
                    alt={video.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-glass flex items-center justify-center">
                    <Video className="h-12 w-12 text-primary opacity-70" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => window.open(video.webViewLink, '_blank')}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => downloadVideo(video.id, video.name)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
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
                <div className="w-24 h-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                  {video.thumbnail && video.thumbnail !== '/api/placeholder/300/200' ? (
                    <img 
                      src={video.thumbnail} 
                      alt={video.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Video className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{video.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{video.duration}</span>
                    <span>{video.size}</span>
                    <span>{video.dateCreated}</span>
                    <Badge variant="outline">
                      {video.format}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => window.open(video.webViewLink, '_blank')}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadVideo(video.id, video.name)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
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
            {selectedFolderId 
              ? `No videos found in the selected folder. Try checking if the folder contains video files directly (not in subfolders).`
              : searchQuery 
                ? "Try adjusting your search terms" 
                : "Connect your Google Drive to see videos"
            }
          </p>
          {!selectedFolderId && (
            <Button variant="glass">
              <Upload className="h-4 w-4 mr-2" />
              Upload Videos
            </Button>
          )}
        </div>
      )}
      
      {/* Background Task Manager */}
      <BackgroundTaskManager 
        tasks={backgroundTasks.tasks}
        onPauseTask={backgroundTasks.pauseTask}
        onResumeTask={backgroundTasks.resumeTask}
        onCancelTask={backgroundTasks.cancelTask}
        onRetryTask={backgroundTasks.retryTask}
      />
    </div>
  );
};

export default VideoOrganizerApp;