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
  X
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
              <div className="relative aspect-[4/5] w-full max-w-[280px] mx-auto bg-black/20 rounded-xl overflow-hidden border border-white/10 mb-4 group cursor-pointer">
                <img
                  src={photo.webViewLink} // Full quality, not thumbnail
                  alt={photo.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="eager" // Load immediately for quality
                  fetchPriority="high" // Prioritize this image
                />
                {/* HD Quality Indicator */}
                <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                  <span className="text-xs text-white/90 font-medium">HD</span>
                </div>
                {/* Download overlay on hover */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <Download className="w-6 h-6 text-white" />
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

            {/* AI Analysis Section */}
            <div className="px-4 py-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-white/70" />
                  <h3 className="text-xs font-medium text-white/90">AI Analysis</h3>
                </div>
                {!photo.analysis && onAnalyze && (
                  <Button
                    onClick={onAnalyze}
                    disabled={isAnalyzing}
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
              <div className="flex gap-3 ml-6">
                <Button
                  variant="glass"
                  size="sm"
                  className="bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20"
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