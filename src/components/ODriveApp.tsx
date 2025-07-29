import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TooltipInfo } from "@/components/ui/tooltip-info";
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
  Home,
  Zap,
  Wand2,
  FileText
} from "lucide-react";
import heroImage from "@/assets/hero-video-bg.jpg";
import { useDirectGoogleDrive } from "@/hooks/useDirectGoogleDrive";
import GoogleDriveFolderInput from "@/components/GoogleDriveFolderInput";
import VideoProcessor from "./VideoProcessor";
import ProcessingResults from "./ProcessingResults";
import BackgroundTaskManager from "./BackgroundTaskManager";
import PhotoCategorizer from "./PhotoCategorizer";
import { useBackgroundTasks } from "@/hooks/useBackgroundTasks";

type ViewMode = "grid" | "list";

const ODriveApp = () => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();
  const [showProcessor, setShowProcessor] = useState(false);
  const [showPhotoOrganizer, setShowPhotoOrganizer] = useState(false);
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
    disconnect,
  } = useDirectGoogleDrive(selectedFolderId);
  
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);

  const filteredVideos = videos.filter(video =>
    video.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Debug logging
  console.log('ODriveApp - videos array:', videos);
  console.log('ODriveApp - videos.length:', videos.length);
  console.log('ODriveApp - searchQuery:', searchQuery);
  console.log('ODriveApp - filteredVideos.length:', filteredVideos.length);
  console.log('ODriveApp - isConnected:', isConnected);
  console.log('ODriveApp - selectedFolderId:', selectedFolderId);

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

          {/* Onboarding Cards for First Time Users */}
          <div className="relative z-10 px-8 pt-16">
            <div className="max-w-4xl mx-auto">
              <div className="liquid-glass-card p-8 mb-8 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30 rounded-3xl shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                <div className="text-center">
                  <h3 className="text-2xl font-semibold text-white mb-4">Step 1: Connect Drive</h3>
                  <p className="text-white/80 mb-6">Select which Google Drive to organize and analyze with AI</p>
                  <Button variant="glow" size="lg">
                    <Zap className="mr-2 h-5 w-5" />
                    Learn More
                  </Button>
                </div>
              </div>
            </div>
          </div>

        {/* Hero Section */}
        <div className="relative z-10 flex items-end justify-center px-8 pt-96 pb-4">
          <div className="text-center max-w-4xl mx-auto">
            <div className="glass-card max-w-2xl mx-auto">
              <div className="mb-8 flex flex-col h-full min-h-[400px]">
                <div className="flex flex-col justify-end h-full">
            <img 
              src="/lovable-uploads/513ecb56-61e2-4e31-9898-d010ccf954a0.png"
              alt="ODrive Logo"
              className="mx-auto h-60 w-auto"
            />
                </div>
                <p className="text-xl text-white/80 mb-8">
                  Seamlessly organize, analyze, and manage your Google Drive files with AI-powered chronological sorting and beautiful glassmorphism interface.
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
                <div className="space-y-6 -mt-12">
                  <Button 
                    onClick={() => connect()}
                    variant="glass"
                    size="lg"
                  >
                    <FolderOpen className="mr-3 h-6 w-6" />
                    Connect Google Drive
                  </Button>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
                    <div className="glass-card text-center p-4">
                      <Camera className="h-8 w-8 mx-auto mb-3 text-primary" />
                      <h3 className="font-semibold mb-2">Photos & Videos</h3>
                       <p className="text-sm text-muted-foreground text-left">
                         Multi-Agent AI system using Claude, GPT-4, and Gemini to intelligently organize your entire media library. Supports ALL file types - photos, videos, documents.
                       </p>
                    </div>
                    <div className="glass-card text-center p-4">
                      <Mic className="h-8 w-8 mx-auto mb-3 text-secondary" />
                      <h3 className="font-semibold mb-2">Voice Assistant</h3>
                       <p className="text-sm text-muted-foreground text-left">
                         Powered by ElevenLabs AI voice. Ask "Why aren't my photos showing?" or "How do I organize by face?" Get instant help with natural conversation.
                       </p>
                    </div>
                    <div className="glass-card text-center p-4">
                      <Settings className="h-8 w-8 mx-auto mb-3 text-accent" />
                      <h3 className="font-semibold mb-2">Smart Analysis</h3>
                       <p className="text-sm text-muted-foreground text-left">
                         Three AI agents working together: Gemini for vision (detects faces, objects, scenes), GPT-4 for metadata extraction, Claude for intelligent organization strategies.
                       </p>
                    </div>
                    <div className="glass-card text-center p-4">
                      <Video className="h-8 w-8 mx-auto mb-3 text-primary" />
                      <h3 className="font-semibold mb-2">Super Vision Agents</h3>
                       <p className="text-sm text-muted-foreground text-left">
                         AI agents that can SEE inside your photos/videos: Detect clothes, colors, objects, red dresses, count people, identify beaches, recognize faces. Creates smart folders automatically.
                       </p>
                    </div>
                    <div className="glass-card text-center p-4">
                      <Camera className="h-8 w-8 mx-auto mb-3 text-secondary" />
                      <h3 className="font-semibold mb-2">Photo Categorization</h3>
                       <p className="text-sm text-muted-foreground text-left">
                         Permission-based AI organization: Automatically creates Google Sheets with your photo data, builds folder structures, tags by location/date/content. Your AI assistant working 24/7.
                       </p>
                    </div>
                    <div className="glass-card text-center p-4">
                      <Cog className="h-8 w-8 mx-auto mb-3 text-accent" />
                      <h3 className="font-semibold mb-2">Automated Organization</h3>
                       <p className="text-sm text-muted-foreground text-left">
                         Set it and forget it: Multi-agent system organizes thousands of files while you sleep. Creates timelines for video editors, sorts by events, generates project files.
                       </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Who Benefits Section */}
        <div className="relative z-10 px-8 pb-24 pt-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-semibold text-white text-center mb-16">
              Who benefits?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Wedding Videographers */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Wedding & Event Videographers
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Transform hours of ceremony footage into perfectly sequenced timelines with automatic organization.
                  </p>
                </div>
              </div>
              
              {/* Travel Vloggers */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <MapPin className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Travel Vloggers & Adventurers
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Keep travel stories authentic with chronological organization by actual shot dates, not upload times.
                  </p>
                </div>
              </div>
              
              {/* Corporate */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <Building2 className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Corporate Storytellers
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Streamline corporate video production with intelligent organization by creation date for consistent storytelling.
                  </p>
                </div>
              </div>
              
              {/* Documentary */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <Film className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Documentary & Indie Film Producers
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Organize complex multi-day shoots automatically to preserve narrative flow and streamline post-production.
                  </p>
                </div>
              </div>
              
              {/* Social Media */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <Smartphone className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Social Media Creators
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Batch process content clips with chronological precision for optimized YouTube, TikTok, and Instagram content.
                  </p>
                </div>
              </div>
              
              {/* Subscription */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <Lock className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Subscription Platforms
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Organize premium content episodes in perfect chronological order for OFTV, Patreon, and subscriber platforms.
                  </p>
                </div>
              </div>
              
              {/* Podcasters */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <Mic className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Podcasters & Vodcast Teams
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Synchronize multi-camera podcast recordings automatically for seamless video podcasts with perfect A/V sync.
                  </p>
                </div>
              </div>
              
              {/* Educators */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <GraduationCap className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Educators & Course Creators
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Maintain educational content in logical learning sequences to preserve lesson flow and comprehension.
                  </p>
                </div>
              </div>
              
              {/* Family */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Family Archivists
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Preserve precious family memories in true chronological order by actual recording dates.
                  </p>
                </div>
              </div>
              
              {/* Real Estate */}
              <div className="glass-card p-8 hover:scale-105 transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl flex items-center justify-center mb-6 border border-white/20">
                    <Home className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-3">
                    Real Estate & Property Marketers
                  </h3>
                  <p className="text-white/80 leading-relaxed">
                    Transform property footage into compelling virtual tours with logical viewing sequences.
                  </p>
                </div>
              </div>
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
            ODrive File Library
          </h1>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="glass border-primary/30">
              <FolderOpen className="h-4 w-4 mr-2" />
              Connected ({videos.length} videos)
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setProcessingResults(null);
                setShowProcessor(false);
                setSearchQuery("");
                setSelectedFolderId(undefined);
                loadVideos();
              }}
              className="glass border-primary/30 text-primary hover:bg-primary/10"
            >
              <Play className="h-4 w-4 mr-2" />
              New Session
            </Button>
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
              variant={viewMode === "grid" ? "glass" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className={viewMode === "grid" ? "glass bg-white/10 border-white/20" : "glass hover:bg-white/5"}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "glass" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className={viewMode === "list" ? "glass bg-white/10 border-white/20" : "glass hover:bg-white/5"}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button variant="glass" size="sm" className="glass hover:bg-white/5">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="glass" size="sm" className="glass hover:bg-white/5">
              <Calendar className="h-4 w-4 mr-2" />
              Organize by Date
            </Button>
            <Button 
              variant="glass" 
              size="sm" 
              className="glass hover:bg-white/5"
              onClick={() => {
                console.log('Organize More Photos button clicked! Current state:', showPhotoOrganizer);
                setShowPhotoOrganizer(!showPhotoOrganizer);
              }}
            >
              <Camera className="h-4 w-4 mr-2" />
              Organize More Photos
            </Button>
          </div>
        </div>
      </div>

      {/* Photo Categorizer */}
      {showPhotoOrganizer && (
        <div className="mb-8">
          <PhotoCategorizer 
            folderId={selectedFolderId}
            onClose={() => setShowPhotoOrganizer(false)}
          />
        </div>
      )}

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
                  <Button variant="glass" size="sm" onClick={() => window.open(video.webViewLink, '_blank')}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => downloadVideo(video.id, video.name)}>
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
            <Button variant="glow">
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

export default ODriveApp;