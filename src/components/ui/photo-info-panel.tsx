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
  Loader,
  Plus
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
  const [isGeneratingCaption, setIsGeneratingCaption] = React.useState(false);
  const [generatedCaption, setGeneratedCaption] = React.useState<string | null>(null);
  const [captionStyle, setCaptionStyle] = React.useState<'social' | 'professional' | 'creative' | 'funny'>('social');
  
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

  // Quick download function for the instant download button
  const handleQuickDownload = async () => {
    try {
      const token = localStorage.getItem('google_access_token');
      if (!token) throw new Error('No access token available');

      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media`;
      
      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = photo.name;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Quick download failed:', error);
    }
  };

  // Caption generator function
  const generateCaption = async () => {
    setIsGeneratingCaption(true);
    try {
      // Get API key from Supabase edge function
      const keyResponse = await fetch(`https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1/get-openai-key`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`
        }
      });
      
      const keyData = await keyResponse.json();
      const apiKey = keyData.apiKey;

      // Create caption prompt based on style
      const stylePrompts = {
        social: "Create a fun, engaging social media caption with emojis and hashtags",
        professional: "Write a professional, business-appropriate caption",
        creative: "Generate a creative, artistic caption with storytelling elements",
        funny: "Make a humorous, witty caption that will make people laugh"
      };

      const analysisContext = photo.analysis ? 
        `Scene: ${photo.analysis.scene}, Objects: ${photo.analysis.objects.join(', ')}, Colors: ${photo.analysis.colors.join(', ')}` : 
        'No analysis available yet';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "gpt-4.1-2025-04-14",
          messages: [{
            role: "user",
            content: `${stylePrompts[captionStyle]} for this image. Context: ${analysisContext}. Image name: ${photo.name}. Keep it under 280 characters and make it engaging.`
          }],
          max_tokens: 100,
          temperature: 0.8
        })
      });

      const data = await response.json();
      setGeneratedCaption(data.choices[0].message.content.trim());
      
    } catch (error) {
      console.error('Caption generation failed:', error);
      setGeneratedCaption("Couldn't generate caption. Please try again.");
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  // Copy caption to clipboard
  const copyCaption = async () => {
    if (generatedCaption) {
      await navigator.clipboard.writeText(generatedCaption);
    }
  };
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
            {/* THE IMAGE - STAR OF THE SHOW */}
            <div className="p-4">
              <div className="relative w-full bg-gradient-to-b from-white/5 to-white/10 rounded-2xl overflow-hidden border border-white/20 mb-6 shadow-2xl min-h-[300px] backdrop-blur-md">
                {isDownloading || isLoadingHdImage ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-sm min-h-[300px]">
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
                      {isLoadingHdImage ? "Loading HD image..." : "Processing image..."}
                    </p>
                    <p className="text-xs text-white/60 text-center px-4 mt-1">
                      {photo.size}
                    </p>
                  </div>
                ) : (
                  <div className="relative w-full min-h-[300px] flex items-center justify-center bg-gradient-to-br from-white/5 to-white/10 p-4">
                    {/* THE MAIN IMAGE - PROMINENTLY DISPLAYED AND CENTERED */}
                    <div className="relative max-w-full flex items-center justify-center">
                      <img
                        src={photo.thumbnailLink || `https://drive.google.com/thumbnail?id=${photo.id}&sz=w800-h600`}
                        alt={photo.name}
                        className="max-w-full max-h-[450px] object-contain rounded-xl shadow-lg"
                        style={{ 
                          width: 'auto',
                          height: 'auto',
                          minHeight: '150px',
                          display: 'block',
                          visibility: 'visible',
                          backgroundColor: 'rgba(255,255,255,0.05)'
                        }}
                        loading="eager"
                        fetchPriority="high"
                        onLoad={(e) => {
                          setFullResLoaded(true);
                          console.log('✅ Image loaded successfully:', photo.name);
                        }}
                        onError={(e) => {
                          console.error('❌ Image failed to load for:', photo.name);
                          
                          // Try multiple fallback strategies
                          if (e.currentTarget.src.includes('thumbnailLink')) {
                            e.currentTarget.src = `https://drive.google.com/thumbnail?id=${photo.id}&sz=w800-h600`;
                          } else if (e.currentTarget.src.includes('drive.google.com/thumbnail')) {
                            e.currentTarget.src = `https://drive.google.com/file/d/${photo.id}/view`;
                          } else if (!e.currentTarget.src.includes('placeholder')) {
                            e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIE5vdCBBdmFpbGFibGU8L3RleHQ+PC9zdmc+';
                          }
                        }}
                      />
                      
                      {/* HD Quality Badge and Actions Overlay */}
                      <div className="absolute top-3 right-3 flex gap-2">
                        <div className="bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
                          <span className="text-xs text-white/90 font-medium">
                            {hdImageUrl ? "HD" : "Preview"}
                          </span>
                        </div>
                        <Button
                          onClick={handleQuickDownload}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 bg-black/60 backdrop-blur-sm hover:bg-black/80 text-white/90 rounded-full border border-white/10"
                          title="Download Image"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* INVISIBLE PROTECTION LINE - Prevents image erasure */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Caption Chatbot - Liquid Glass Expandable Interface */}
              <div className="relative overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-teal-500/10 to-blue-500/10 backdrop-blur-md border border-white/20 rounded-xl mx-2 mb-4 shadow-lg">
                  {/* Chatbot Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400/20 to-blue-400/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                        <img 
                          src="/lovable-uploads/86e12b2b-20b7-4e0c-86c4-e6006280bc1c.png" 
                          alt="Caption AI" 
                          className="w-4 h-4"
                        />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-white/95">Caption AI Assistant</h3>
                        <p className="text-xs text-white/70">Let me craft the perfect caption for you</p>
                      </div>
                    </div>
                    <Button
                      onClick={generateCaption}
                      disabled={isGeneratingCaption}
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 p-0 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 hover:text-teal-200 rounded-full border border-teal-400/30"
                      title="Generate Caption with AI"
                    >
                      {isGeneratingCaption ? (
                        <div className="w-5 h-5 border-2 border-teal-300/30 border-t-teal-300 rounded-full animate-spin" />
                      ) : (
                        <img 
                          src="/lovable-uploads/86e12b2b-20b7-4e0c-86c4-e6006280bc1c.png" 
                          alt="AI Magic" 
                          className="w-6 h-6"
                        />
                      )}
                    </Button>
                  </div>

                  {/* Chat-style Caption Categories */}
                  <div className="mb-4">
                    <p className="text-xs text-white/60 mb-2">Choose your caption style:</p>
                    <div className="flex flex-wrap gap-2">
                      {['social', 'professional', 'creative', 'funny'].map((style) => (
                        <button
                          key={style}
                          onClick={() => setCaptionStyle(style as any)}
                          className={`px-3 py-1 rounded-full text-xs border transition-all ${
                            captionStyle === style
                              ? 'bg-teal-500/30 border-teal-400/50 text-teal-200'
                              : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                          }`}
                        >
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generated Caption Display - Chat Bubble Style */}
                  {generatedCaption && (
                    <div className="space-y-3">
                      {/* AI Response Bubble */}
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-400/30 to-blue-400/30 flex items-center justify-center flex-shrink-0">
                          <img 
                            src="/lovable-uploads/86e12b2b-20b7-4e0c-86c4-e6006280bc1c.png" 
                            alt="AI" 
                            className="w-3 h-3"
                          />
                        </div>
                        <div className="flex-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                          <p className="text-xs text-white/90 leading-relaxed">
                            {generatedCaption}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <Button
                              onClick={copyCaption}
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded-lg border border-teal-400/30"
                            >
                              📋 Copy
                            </Button>
                            <Button
                              onClick={() => setGeneratedCaption(null)}
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 rounded-lg border border-pink-400/30"
                            >
                              🔄 New
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Loading State - Typing Indicator */}
                  {isGeneratingCaption && (
                    <div className="flex items-center gap-2 mt-3">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-400/30 to-blue-400/30 flex items-center justify-center">
                        <img 
                          src="/lovable-uploads/86e12b2b-20b7-4e0c-86c4-e6006280bc1c.png" 
                          alt="AI" 
                          className="w-3 h-3"
                        />
                      </div>
                      <div className="bg-white/10 rounded-xl px-3 py-2 border border-white/20">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-teal-400/60 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-teal-400/60 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-teal-400/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Welcome Message */}
                  {!generatedCaption && !isGeneratingCaption && (
                    <div className="text-center py-2">
                      <p className="text-xs text-white/60">
                        ✨ Pick a style above and click the sparkle to generate your perfect caption
                      </p>
                    </div>
                  )}
                </div>
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

            {/* AI Analysis Section with custom AI icon */}
            <div className="px-4 py-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <img 
                    src="/lovable-uploads/86e12b2b-20b7-4e0c-86c4-e6006280bc1c.png" 
                    alt="AI Analysis" 
                    className="w-4 h-4"
                  />
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

                  {/* Categories - Show actual tag names */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/60">Categories:</span>
                      {photo.analysis.categories.map((category, index) => (
                        <div key={index} className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full border border-white/20">
                          <Tag className="w-3 h-3 text-white/70" />
                          <span className="text-xs text-white/80">{category}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Objects - Show actual object names */}
                  {photo.analysis.objects.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-white/60">Objects:</span>
                        {photo.analysis.objects.map((object, index) => (
                          <div key={index} className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full border border-white/20">
                            <Eye className="w-3 h-3 text-white/70" />
                            <span className="text-xs text-white/80">{object}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Colors - Icons only, no bubbles */}
                  {photo.analysis.colors.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/60">Colors:</span>
                        {photo.analysis.colors.map((color, index) => (
                          <div key={index} title={color}>
                            <Palette className="w-3 h-3 text-white/70" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* People - Just icon */}
                  {photo.analysis.faces > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white/60">People detected:</span>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-white/70" />
                        <span className="text-sm text-white/90">{photo.analysis.faces}</span>
                      </div>
                    </div>
                  )}

                  {/* Landmarks - Just icons */}
                  {photo.analysis.landmarks.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white/60">Landmarks:</span>
                        {photo.analysis.landmarks.map((landmark, index) => (
                          <div key={index} title={landmark}>
                            <MapPin className="w-3 h-3 text-white/70" />
                          </div>
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