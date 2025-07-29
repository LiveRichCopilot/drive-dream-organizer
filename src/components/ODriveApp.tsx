import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TooltipInfo } from "@/components/ui/tooltip-info";
import AssistantChat from "@/components/AssistantChat";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import { useAnalytics } from "@/hooks/useAnalytics";
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
  FileText,
  BarChart3
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
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [processingResults, setProcessingResults] = useState<any>(null);
  
  const backgroundTasks = useBackgroundTasks();
  const analytics = useAnalytics();
  
  const {
    isConnected,
    isLoading,
    videos,
    progress,
    connect,
    loadVideos,
    downloadVideo,
    downloadHighRes,
    disconnect,
  } = useDirectGoogleDrive(selectedFolderId);
  
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [sortedVideos, setSortedVideos] = useState(videos);

  // Update sortedVideos when videos change
  useEffect(() => {
    setSortedVideos(videos);
  }, [videos]);

  const filteredVideos = sortedVideos.filter(video =>
    video.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Track search events
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      analytics.trackSearch({
        search_query: query,
        results_count: videos.filter(v => 
          v.name.toLowerCase().includes(query.toLowerCase())
        ).length,
        search_type: 'video_name'
      });
    }
  };
  
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
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          </div>


        {/* Hero Section */}
        <div className="relative z-10 flex items-end justify-center px-8 pt-96 pb-4">
          <div className="text-center max-w-4xl mx-auto">
            <div className="glass-card max-w-2xl mx-auto" style={{boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)'}}>
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
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(/lovable-uploads/dc64f127-2b10-47ef-85f9-dae7993d47c4.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      </div>
      <div className="relative z-10">
      {/* Header */}
      <div className="bg-white/5 border border-white/20 rounded-2xl p-6 mb-8 shadow-[0_4px_24px_6px_rgba(0,0,0,0.10)]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col items-center gap-0">
            {/* ODrive Logo */}
            <img 
              src="/lovable-uploads/742a5faa-ce9b-4474-a2a9-24e42ae9b81b.png" 
              alt="ODrive Logo" 
              className="w-48 h-48 object-contain"
            />
            <span className="text-lg font-sf font-medium text-white/70 tracking-wide">
              File Library
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm px-2 py-1 text-white/40">
              <FolderOpen className="h-4 w-4 mr-2 text-white/40 inline" />
              Connected ({videos.length})
            </div>
            <button 
              onClick={() => {
                setProcessingResults(null);
                setShowProcessor(false);
                setSearchQuery("");
                setSelectedFolderId(undefined);
                loadVideos();
              }}
              className="text-white/40 hover:text-white/80 text-sm px-3 py-1 h-8"
            >
              <Play className="h-4 w-4 mr-2 inline text-cyan-400" />
              New Session
            </button>
            <button 
              onClick={() => { setSelectedFolderId(undefined); disconnect(); }} 
              className="text-white/40 hover:text-white/80 text-sm px-3 py-1 h-8"
            >
              <LogOut className="h-4 w-4 mr-2 inline text-red-400" />
              Disconnect
            </button>
          </div>
        </div>

        {/* Folder Selection - Always Show */}
        <div className="mb-6">
          <div className="bg-black/40 backdrop-blur-[25px] backdrop-saturate-[200%] border border-white/15 rounded-2xl p-6 shadow-lg shadow-[inset_0_2px_8px_rgba(0,0,0,0.26)]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.2'/%3E%3C/svg%3E")`,
            backgroundBlendMode: 'overlay'
          }}>
            <div className="flex items-center gap-4 mb-4">
              <FolderOpen className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Folder Access</h2>
              {selectedFolderId && (
                <Badge variant="outline" className="border-green-400/20 text-green-400 bg-transparent">
                  Folder Selected
                </Badge>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shadow-xl">
              {/* All Files Option */}
              <div 
                className="bg-gray-300/20 backdrop-blur-sm border-2 border-white/5 hover:border-white/15 hover:bg-gray-300/30 p-4 cursor-pointer rounded-xl transition-all opacity-70"
                onClick={() => {
                  setSelectedFolderId(undefined);
                  loadVideos();
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">All Files</h3>
                    <p className="text-sm text-white/60">Browse your entire Google Drive</p>
                  </div>
                </div>
              </div>
              
              {/* Specific Folder Option */}
              <div 
                className="bg-gray-300/20 backdrop-blur-sm border-2 border-white/5 hover:border-white/15 hover:bg-gray-300/30 p-4 cursor-pointer rounded-xl transition-all opacity-70"
                onClick={() => setShowFolderInput(!showFolderInput)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center">
                    <Settings className="h-8 w-8 text-orange-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Specific Folder</h3>
                    <p className="text-sm text-white/60">Target a specific folder (like "HD")</p>
                  </div>
                </div>
              </div>
            </div>
            
            {showFolderInput && (
              <div className="mt-6">
                <GoogleDriveFolderInput 
                  onFolderSelected={(folderId) => {
                    console.log('Folder selected:', folderId);
                    setSelectedFolderId(folderId);
                    setShowFolderInput(false);
                    // Load videos immediately with the specific folder ID
                    loadVideos(folderId);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Processing Pipeline */}
        {videos.length > 0 && (
          <div className="mb-6">
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
          <div className={`relative transition-all duration-300 ${searchQuery ? 'max-w-2xl w-full' : 'max-w-xs'}`}>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-white/60" />
            <Input
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-8 py-2 text-sm bg-black/25 backdrop-blur-[40px] backdrop-saturate-[200%] border border-white/20 rounded-xl text-white placeholder-white/40 h-9 focus:border-teal-200/40 focus:ring-2 focus:ring-teal-200/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.1)]"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <div 
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg transition-colors ${viewMode === "grid" ? "text-white/90" : "text-white/60 hover:text-white/80"}`}
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-5 w-5" />
              <span className="text-sm">Grid</span>
            </div>
            <div 
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg transition-colors ${viewMode === "list" ? "text-white/90" : "text-white/60 hover:text-white/80"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-5 w-5" />
              <span className="text-sm">List</span>
            </div>
            <div 
              className="flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg text-white/70 hover:text-white/90 transition-colors"
              onClick={() => setShowProcessor(!showProcessor)}
            >
              <Cog className="h-5 w-5" />
              <span className="text-sm">Organize Drive</span>
            </div>
            <div 
              className="flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg text-white/70 hover:text-white/90 transition-colors"
              onClick={() => {
                console.log('Organize More Photos button clicked! Current state:', showPhotoOrganizer);
                setShowPhotoOrganizer(!showPhotoOrganizer);
              }}
            >
              <Camera className="h-5 w-5" />
              <span className="text-sm">AI Photo Organizer</span>
            </div>
            <div 
              className="flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg text-white/70 hover:text-white/90 transition-colors"
              onClick={() => setShowAnalytics(!showAnalytics)}
            >
              <BarChart3 className="h-5 w-5" />
              <span className="text-sm">Analytics</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Dashboard */}
      {showAnalytics && (
        <div className="mb-8">
          <AnalyticsDashboard onEvent={analytics.trackEvent} />
        </div>
      )}

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
            <Card key={video.id} className="bg-black/40 backdrop-blur-[25px] backdrop-saturate-[200%] border border-white/15 rounded-2xl shadow-lg shadow-[inset_0_2px_8px_rgba(0,0,0,0.26)] group cursor-pointer hover:bg-black/50 transition-all duration-300">
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
                 <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                   <div className="flex gap-2">
                     <Button size="sm" variant="secondary" onClick={() => window.open(video.webViewLink, '_blank')}>
                       <Play className="h-4 w-4" />
                     </Button>
                     <Button size="sm" variant="secondary" onClick={() => downloadVideo(video.id, video.name)}>
                       <Download className="h-4 w-4" />
                     </Button>
                     <Button size="sm" variant="glass" onClick={() => downloadHighRes(video.id, video.name)} title="High Resolution Download">
                       <Download className="h-3 w-3" />
                       <span className="text-xs ml-1">HD</span>
                     </Button>
                   </div>
                 </div>
              </div>
              <div className="space-y-2 bg-white/15 backdrop-blur-[15px] backdrop-saturate-[180%] border border-white/10 rounded-xl p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                <h3 className="font-semibold text-sm leading-tight break-words">{video.name}</h3>
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
                 <div className="flex items-center justify-between text-sm text-muted-foreground">
                   <span>{video.size}</span>
                   <span className="text-white/80 font-medium">{video.format}</span>
                 </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVideos.map((video) => (
            <Card key={video.id} className="glass-card opacity-60">
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
                   <Play className="h-4 w-4 cursor-pointer" onClick={() => window.open(video.webViewLink, '_blank')} />
                   <Download className="h-4 w-4 cursor-pointer" onClick={() => downloadVideo(video.id, video.name)} />
                   <Zap className="h-4 w-4 cursor-pointer" onClick={() => downloadHighRes(video.id, video.name)} />
                 </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {filteredVideos.length === 0 && (
        <div className="bg-white/5 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_4px_24px_6px_rgba(0,0,0,0.10)] text-center py-12 px-6 mx-6">
          <Video className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
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
            <button className="text-white/70 hover:text-white transition-colors">
              <Upload className="h-4 w-4 mr-2 inline" />
              Upload Videos
            </button>
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
      
      {/* Assistant Chat */}
      <AssistantChat
        isOpen={showAssistant}
        onToggle={() => setShowAssistant(!showAssistant)}
        onAnalyticsEvent={analytics.trackEvent}
      />
      </div>
    </div>
  );
};

export default ODriveApp;