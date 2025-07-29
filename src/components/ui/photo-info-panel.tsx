import * as React from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  FileImage, 
  Palette, 
  Users, 
  MapPin, 
  Camera, 
  Eye,
  Monitor,
  Tag,
  Info,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Sparkles,
  X,
  Loader
} from "lucide-react";

interface PhotoAnalysis {
  categories: string[];
  colors: string[];
  faces: number;
  landmarks: string[];
  objects: string[];
  scene: string;
  confidence: number;
  prompt?: string;
}

interface PhotoInfoPanelProps {
  photo: {
    id: string;
    name: string;
    thumbnailLink?: string;
    webViewLink: string;
    webContentLink?: string; // Full resolution download URL
    size: string;
    createdTime: string;
    modifiedTime: string;
    analysis?: PhotoAnalysis;
  };
  children: React.ReactNode;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
}

export const PhotoInfoPanel: React.FC<PhotoInfoPanelProps> = ({ 
  photo, 
  children, 
  onAnalyze,
  isAnalyzing = false 
}) => {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [fullResLoaded, setFullResLoaded] = React.useState(false);
  const [hdImageUrl, setHdImageUrl] = React.useState<string | null>(null);
  const [isLoadingHdImage, setIsLoadingHdImage] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState(0);
  
  // Get file size in MB for display
  const getFileSizeDisplay = (sizeString: string) => {
    const match = sizeString.match(/[\d.]+/);
    if (match) {
      const size = parseFloat(match[0]);
      if (size > 1000000) {
        return `${(size / 1000000).toFixed(1)} MB`;
      }
    }
    return sizeString;
  };

  const handleDownload = async () => {
    if (!photo.webContentLink) return;
    
    setIsDownloading(true);
    try {
      const response = await fetch(photo.webContentLink);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = photo.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Load HD image for analysis with progress tracking
  const loadHdImage = async () => {
    if (hdImageUrl || isLoadingHdImage) return; // Already loaded or loading
    
    setIsLoadingHdImage(true);
    setDownloadProgress(0);
    
    try {
      const token = localStorage.getItem('google_access_token');
      if (!token) throw new Error('No access token available');

      // Use Google Drive download API for full resolution
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media`;
      
      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load HD image: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
      
      if (!response.body) {
        throw new Error('Response body is not available');
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        // Update progress
        if (totalSize > 0) {
          const progress = Math.round((receivedLength / totalSize) * 100);
          setDownloadProgress(progress);
        }
      }

      // Combine chunks into single Uint8Array
      const chunksAll = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        chunksAll.set(chunk, position);
        position += chunk.length;
      }

      // Create blob and object URL
      const blob = new Blob([chunksAll]);
      const url = URL.createObjectURL(blob);
      setHdImageUrl(url);
      setDownloadProgress(100);
      
    } catch (error) {
      console.error('Failed to load HD image:', error);
      setDownloadProgress(0);
    } finally {
      setIsLoadingHdImage(false);
    }
  };

  // Enhanced analyze function that loads HD image first
  const handleAnalyze = async () => {
    if (!onAnalyze) return;
    
    // First load the HD image
    await loadHdImage();
    
    // Then start the analysis
    onAnalyze();
  };

  // Cleanup HD image URL when component unmounts
  React.useEffect(() => {
    return () => {
      if (hdImageUrl) {
        URL.revokeObjectURL(hdImageUrl);
      }
    };
  }, [hdImageUrl]);

  // Auto-load HD image when panel opens
  React.useEffect(() => {
    loadHdImage();
  }, [photo.id]); // Load whenever photo changes
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] p-0 bg-white/10 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/30 shadow-lg rounded-2xl z-[100] overflow-hidden">
        <div className="relative h-full flex flex-col max-h-[90vh]">
          {/* Draggable Header */}
          <div className="flex items-center justify-between p-3 border-b border-white/10 cursor-move select-none relative z-20 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                <FileImage className="w-3 h-3 text-white/90" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-medium text-white/90 truncate">
                  {photo.name}
                </h2>
                <p className="text-xs text-white/60">{photo.size}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gradient-to-b scrollbar-thumb-from-teal-200/30 scrollbar-thumb-to-blue-200/30 hover:scrollbar-thumb-from-teal-200/40 hover:scrollbar-thumb-to-blue-200/40 scrollbar-w-1">
            {/* HD Preview - The Star of the Show */}
            <div className="p-4">
              <div className="liquid-glass-modal relative aspect-[4/5] w-full max-w-[280px] mx-auto bg-black/20 rounded-xl overflow-hidden border border-white/10 mb-4">
                {isDownloading || isLoadingHdImage ? (
                  <div className="loading w-full h-full flex flex-col items-center justify-center bg-black/30">
                    {/* Circular Progress Meter */}
                    <div className="relative w-16 h-16 mb-3">
                      {/* Background circle */}
                      <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          stroke="rgba(255,255,255,0.2)"
                          strokeWidth="4"
                          fill="none"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          stroke="rgba(59,130,246,0.8)"
                          strokeWidth="4"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 28}`}
                          strokeDashoffset={`${2 * Math.PI * 28 * (1 - downloadProgress / 100)}`}
                          className="transition-all duration-300 ease-out"
                        />
                      </svg>
                      {/* Percentage text */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-bold text-white">
                          {downloadProgress}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-white/80 text-center px-4">
                      {isLoadingHdImage ? "Downloading HD image..." : "Downloading high-resolution image..."}
                    </p>
                    <p className="text-xs text-white/60 text-center px-4 mt-1">
                      {photo.size}
                    </p>
                  </div>
                ) : (
                  <>
                    <img
                      src={hdImageUrl || photo.thumbnailLink || `https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media&access_token=${localStorage.getItem('google_access_token')}`} 
                      alt={photo.name}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      loading="eager" // Load immediately for quality
                      fetchPriority="high" // Prioritize this image
                      onLoad={() => setFullResLoaded(true)}
                      onError={(e) => {
                        // Fallback to basic download URL if thumbnail fails
                        e.currentTarget.src = `https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media&access_token=${localStorage.getItem('google_access_token')}`;
                      }}
                    />
                    {/* HD Quality Indicator */}
                    <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                      <span className="text-xs text-white/90 font-medium">
                        {hdImageUrl ? "HD" : "Preview"}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* General Info */}
            <div className="px-4 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-3 h-3 text-white/70" />
                <h3 className="text-xs font-medium text-white/90">General</h3>
              </div>
              <div className="space-y-1.5 ml-5">
                <div className="flex justify-between">
                  <span className="text-xs text-white/60">Kind:</span>
                  <span className="text-xs text-white/90">JPEG image</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/60">Size:</span>
                  <span className="text-xs text-white/90">{photo.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/60">Created:</span>
                  <span className="text-xs text-white/90">{photo.createdTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/60">Modified:</span>
                  <span className="text-xs text-white/90">{photo.modifiedTime}</span>
                </div>
              </div>
            </div>

            <Separator className="bg-white/10" />

            {/* AI Analysis Section */}
            <div className="px-4 py-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-white/70" />
                  <h3 className="text-xs font-medium text-white/90">AI Analysis</h3>
                </div>
                {!photo.analysis && onAnalyze && (
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || isLoadingHdImage}
                    variant="glass"
                    size="sm"
                    className="bg-white/3 backdrop-blur-md border border-white/10 text-white/70 hover:bg-white/5 hover:text-white/90 text-xs px-2 py-1"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-2 h-2 mr-1.5 border-2 border-white/30 border-t-white/90 rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-2 h-2 mr-1.5" />
                        Analyze
                      </>
                    )}
                  </Button>
                )}
              </div>

              {photo.analysis ? (
                <div className="space-y-2 ml-5">
                  {/* Scene */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white/60">Scene:</span>
                    <Badge variant="secondary" className="bg-white/10 border-white/20 text-white/90">
                      {photo.analysis.scene}
                    </Badge>
                  </div>

                  {/* Categories */}
                  <div className="space-y-1">
                    <span className="text-xs text-white/60">Categories:</span>
                    <div className="flex flex-wrap gap-1">
                      {photo.analysis.categories.map((category, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="bg-white/5 border-white/20 text-white/80 text-[10px] px-1.5 py-0.5 h-5"
                        >
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Objects */}
                  {photo.analysis.objects.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-white/60">Objects:</span>
                      <div className="flex flex-wrap gap-1">
                        {photo.analysis.objects.map((object, index) => (
                          <Badge 
                            key={index} 
                            variant="outline" 
                            className="bg-white/5 border-white/20 text-white/80 text-[10px] px-1.5 py-0.5 h-5"
                          >
                            {object}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Colors */}
                  {photo.analysis.colors.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-white/60">Colors:</span>
                      <div className="flex flex-wrap gap-1">
                        {photo.analysis.colors.map((color, index) => (
                          <Badge 
                            key={index} 
                            variant="outline" 
                            className="bg-white/5 border-white/20 text-white/80 text-[10px] px-1.5 py-0.5 h-5"
                          >
                            {color}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* People */}
                  {photo.analysis.faces > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white/60">People detected:</span>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-white/70" />
                        <span className="text-sm text-white/90">{photo.analysis.faces}</span>
                      </div>
                    </div>
                  )}

                  {/* Landmarks */}
                  {photo.analysis.landmarks.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-sm text-white/60">Landmarks:</span>
                      <div className="flex flex-wrap gap-2">
                        {photo.analysis.landmarks.map((landmark, index) => (
                          <Badge 
                            key={index} 
                            variant="outline" 
                            className="bg-white/5 border-white/20 text-white/80 text-xs"
                          >
                            <MapPin className="w-3 h-3 mr-1" />
                            {landmark}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Prompt */}
                  {photo.analysis.prompt && (
                    <div className="space-y-2">
                      <span className="text-sm text-white/60">AI Generation Prompt:</span>
                      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                        <p className="text-xs text-white/80 font-mono leading-relaxed">
                          {photo.analysis.prompt}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Confidence */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white/60">Confidence:</span>
                    <span className="text-sm text-white/90">
                      {Math.round(photo.analysis.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ) : (
                <div className="ml-6 text-sm text-white/60">
                  Click "Analyze Photo" to extract detailed information using AI vision
                </div>
              )}
            </div>

            <Separator className="bg-white/10" />

            {/* Actions */}
            <div className="px-6 py-4">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-4 h-4 text-white/70" />
                <h3 className="text-sm font-medium text-white/90">Actions</h3>
              </div>
              <div className="flex flex-col gap-3 ml-6">
                <Button
                  onClick={handleDownload}
                  disabled={isDownloading || !photo.webContentLink}
                  className="liquid-glass bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20 transition-all duration-300"
                  size="sm"
                >
                  {isDownloading ? (
                    <>
                      <Loader className="w-3 h-3 mr-2 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3 mr-2" />
                      Download Original ({getFileSizeDisplay(photo.size)})
                    </>
                  )}
                </Button>
                
                <Button
                  variant="glass"
                  size="sm"
                  className="bg-white/5 backdrop-blur-md border border-white/10 text-white/70 hover:bg-white/10 hover:text-white/90"
                  asChild
                >
                  <a href={photo.webViewLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-2" />
                    Open in Drive
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};