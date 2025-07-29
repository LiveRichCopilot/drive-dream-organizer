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
      <DialogContent className="max-w-2xl p-0 overflow-hidden glass-card border-white/20 bg-black/60 backdrop-blur-3xl">
        <div className="relative">
          {/* Header with close button */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                <FileImage className="w-4 h-4 text-white/90" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white/90 truncate max-w-md">
                  {photo.name}
                </h2>
                <p className="text-sm text-white/60">{photo.size}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[70vh] overflow-y-auto">
            {/* Preview */}
            <div className="p-6">
              <div className="aspect-video bg-black/20 rounded-xl overflow-hidden border border-white/10 mb-6">
                <img
                  src={photo.thumbnailLink || photo.webViewLink}
                  alt={photo.name}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* General Info */}
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-4 h-4 text-white/70" />
                <h3 className="text-sm font-medium text-white/90">General</h3>
              </div>
              <div className="space-y-3 ml-6">
                <div className="flex justify-between">
                  <span className="text-sm text-white/60">Kind:</span>
                  <span className="text-sm text-white/90">JPEG image</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-white/60">Size:</span>
                  <span className="text-sm text-white/90">{photo.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-white/60">Created:</span>
                  <span className="text-sm text-white/90">{photo.createdTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-white/60">Modified:</span>
                  <span className="text-sm text-white/90">{photo.modifiedTime}</span>
                </div>
              </div>
            </div>

            <Separator className="bg-white/10" />

            {/* AI Analysis Section */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-white/70" />
                  <h3 className="text-sm font-medium text-white/90">AI Analysis</h3>
                </div>
                {!photo.analysis && onAnalyze && (
                  <Button
                    onClick={onAnalyze}
                    disabled={isAnalyzing}
                    variant="glass"
                    size="sm"
                    className="bg-white/10 backdrop-blur-md border border-white/20 text-white/90 hover:bg-white/20"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-3 h-3 mr-2 border-2 border-white/30 border-t-white/90 rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-2" />
                        Analyze Photo
                      </>
                    )}
                  </Button>
                )}
              </div>

              {photo.analysis ? (
                <div className="space-y-4 ml-6">
                  {/* Scene */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white/60">Scene:</span>
                    <Badge variant="secondary" className="bg-white/10 border-white/20 text-white/90">
                      {photo.analysis.scene}
                    </Badge>
                  </div>

                  {/* Categories */}
                  <div className="space-y-2">
                    <span className="text-sm text-white/60">Categories:</span>
                    <div className="flex flex-wrap gap-2">
                      {photo.analysis.categories.map((category, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="bg-white/5 border-white/20 text-white/80 text-xs"
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Objects */}
                  {photo.analysis.objects.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-sm text-white/60">Objects detected:</span>
                      <div className="flex flex-wrap gap-2">
                        {photo.analysis.objects.map((object, index) => (
                          <Badge 
                            key={index} 
                            variant="outline" 
                            className="bg-white/5 border-white/20 text-white/80 text-xs"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            {object}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Colors */}
                  {photo.analysis.colors.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-sm text-white/60">Dominant colors:</span>
                      <div className="flex flex-wrap gap-2">
                        {photo.analysis.colors.map((color, index) => (
                          <Badge 
                            key={index} 
                            variant="outline" 
                            className="bg-white/5 border-white/20 text-white/80 text-xs"
                          >
                            <Palette className="w-3 h-3 mr-1" />
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