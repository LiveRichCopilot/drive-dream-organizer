import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Image, 
  Video, 
  FileImage, 
  Palette,
  Users,
  MapPin,
  Eye,
  Download,
  Loader2,
  Upload
} from "lucide-react";

interface AssetFile {
  id: string;
  name: string;
  url: string;
  type: 'photo' | 'video' | 'icon' | 'gif';
  size: number;
  analysis?: {
    categories: string[];
    colors: string[];
    faces: number;
    landmarks: string[];
    objects: string[];
    scene: string;
    confidence: number;
  };
}

const AssetOrganizer = () => {
  const [activeTab, setActiveTab] = useState("photos");
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const { toast } = useToast();

  const handleFileUpload = async (files: FileList) => {
    const uploadedAssets: AssetFile[] = [];
    
    for (const file of Array.from(files)) {
      const fileType = getFileType(file.name);
      if (!fileType) continue;

      try {
        // Create object URL for preview
        const url = URL.createObjectURL(file);
        const asset: AssetFile = {
          id: `temp-${Date.now()}-${Math.random()}`,
          name: file.name,
          url,
          type: fileType,
          size: file.size
        };
        
        uploadedAssets.push(asset);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }

    setAssets(prev => [...prev, ...uploadedAssets]);
    
    if (uploadedAssets.length > 0) {
      toast({
        title: "Files uploaded",
        description: `Added ${uploadedAssets.length} files for analysis`,
      });
    }
  };

  const getFileType = (fileName: string): AssetFile['type'] | null => {
    const ext = fileName.toLowerCase().split('.').pop();
    
    if (['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext || '')) {
      return 'photo';
    } else if (['mp4', 'mov', 'm4v', 'avi'].includes(ext || '')) {
      return 'video';
    } else if (['ico', 'icns', 'svg'].includes(ext || '')) {
      return 'icon';
    } else if (ext === 'gif') {
      return 'gif';
    }
    
    return null;
  };

  const analyzePhotos = async () => {
    const photoAssets = assets.filter(asset => 
      asset.type === 'photo' && !asset.analysis
    );

    if (photoAssets.length === 0) {
      toast({
        title: "No photos to analyze",
        description: "Upload some photos first",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      // Process in batches of 16 for cost efficiency
      const batchSize = 16;
      const batches = [];
      
      for (let i = 0; i < photoAssets.length; i += batchSize) {
        batches.push(photoAssets.slice(i, i + batchSize));
      }

      let processedCount = 0;

      for (const batch of batches) {
        const imageRequests = batch.map(asset => ({
          imageUrl: asset.url,
          fileName: asset.name
        }));

        const response = await supabase.functions.invoke('photo-analysis', {
          body: { images: imageRequests }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        const { results } = response.data;

        // Update assets with analysis results
        setAssets(prev => prev.map(asset => {
          const result = results.find((r: any) => r.fileName === asset.name);
          if (result) {
            return {
              ...asset,
              analysis: {
                categories: result.categories,
                colors: result.colors,
                faces: result.faces,
                landmarks: result.landmarks,
                objects: result.objects,
                scene: result.scene,
                confidence: result.confidence
              }
            };
          }
          return asset;
        }));

        processedCount += results.length;
        setAnalysisProgress((processedCount / photoAssets.length) * 100);

        // Store analysis results for future use
        for (const result of results) {
          try {
            await supabase.from('asset_categories').upsert({
              file_name: result.fileName,
              categories: result.categories,
              scene_type: result.scene,
              face_count: result.faces,
              confidence_score: result.confidence,
              metadata: {
                colors: result.colors,
                landmarks: result.landmarks,
                objects: result.objects
              }
            });
          } catch (error) {
            console.error('Error storing analysis:', error);
          }
        }
      }

      toast({
        title: "Analysis complete",
        description: `Analyzed ${processedCount} photos with AI`,
      });

    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis failed",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    const newSelection = new Set(selectedAssets);
    if (newSelection.has(assetId)) {
      newSelection.delete(assetId);
    } else {
      newSelection.add(assetId);
    }
    setSelectedAssets(newSelection);
  };

  const exportSelected = () => {
    const selected = assets.filter(asset => selectedAssets.has(asset.id));
    console.log('Exporting assets:', selected);
    
    toast({
      title: "Export started",
      description: `Exporting ${selected.length} selected assets`,
    });
  };

  const renderPhotoGrid = () => {
    const photos = assets.filter(asset => asset.type === 'photo');
    
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
            className="hidden"
            id="photo-upload"
          />
          <label htmlFor="photo-upload">
            <Button variant="outline" className="cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              Upload Photos
            </Button>
          </label>
          
          <Button 
            onClick={analyzePhotos}
            disabled={isAnalyzing || photos.length === 0}
            className="flex items-center gap-2"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            Analyze with AI
          </Button>

          {selectedAssets.size > 0 && (
            <Button onClick={exportSelected} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Selected ({selectedAssets.size})
            </Button>
          )}
        </div>

        {isAnalyzing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Analyzing photos...</span>
              <span>{Math.round(analysisProgress)}%</span>
            </div>
            <Progress value={analysisProgress} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {photos.map((photo) => (
            <Card 
              key={photo.id} 
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedAssets.has(photo.id) ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => toggleAssetSelection(photo.id)}
            >
              <div className="aspect-square relative overflow-hidden rounded-t-lg">
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                />
                {selectedAssets.has(photo.id) && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
              
              <CardContent className="p-4">
                <h4 className="font-medium text-sm truncate mb-2">{photo.name}</h4>
                
                {photo.analysis ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {photo.analysis.scene}
                      </Badge>
                      {photo.analysis.faces > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Users className="w-3 h-3 mr-1" />
                          {photo.analysis.faces}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {photo.analysis.categories.slice(0, 3).map((category) => (
                        <Badge key={category} variant="outline" className="text-xs">
                          {category}
                        </Badge>
                      ))}
                    </div>

                    {photo.analysis.colors.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Palette className="w-3 h-3" />
                        <div className="flex gap-1">
                          {photo.analysis.colors.slice(0, 3).map((color, index) => (
                            <div
                              key={index}
                              className="w-3 h-3 rounded-full border"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Click "Analyze with AI" to categorize
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Asset Organizer</h1>
        <p className="text-muted-foreground">
          Upload and organize your photos, videos, icons, and GIFs with AI-powered categorization
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="photos" className="flex items-center gap-2">
            <Image className="w-4 h-4" />
            Photos
          </TabsTrigger>
          <TabsTrigger value="videos" className="flex items-center gap-2">
            <Video className="w-4 h-4" />
            Videos
          </TabsTrigger>
          <TabsTrigger value="icons" className="flex items-center gap-2">
            <FileImage className="w-4 h-4" />
            Icons
          </TabsTrigger>
          <TabsTrigger value="gifs" className="flex items-center gap-2">
            <Image className="w-4 h-4" />
            GIFs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Photo Collection</CardTitle>
              <CardDescription>
                Upload photos for AI-powered categorization and organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderPhotoGrid()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="videos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Video Collection</CardTitle>
              <CardDescription>
                Organize your video files by date and content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-8">
                Video organization coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="icons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Icon Collection</CardTitle>
              <CardDescription>
                Categorize icons by size, style, and usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-8">
                Icon organization coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gifs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>GIF Collection</CardTitle>
              <CardDescription>
                Sort GIFs by type, duration, and content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-8">
                GIF organization coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AssetOrganizer;