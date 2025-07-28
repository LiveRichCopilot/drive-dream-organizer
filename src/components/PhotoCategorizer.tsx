import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

import { 
  Camera, 
  Sparkles, 
  FolderPlus, 
  Search,
  X,
  Image,
  Palette,
  Users,
  MapPin,
  Tags,
  Loader2,
  Upload,
  Eye,
  Download,
  Plus
} from "lucide-react";
import { useDirectGoogleDrive } from "@/hooks/useDirectGoogleDrive";

interface PhotoFile {
  id: string;
  name: string;
  thumbnailLink?: string;
  webViewLink: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
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

interface Category {
  id: string;
  name: string;
  description: string;
  photoCount: number;
  photos: PhotoFile[];
}

interface PhotoCategorizerProps {
  folderId?: string;
  onClose: () => void;
}

const PhotoCategorizer = ({ folderId, onClose }: PhotoCategorizerProps) => {
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [viewMode, setViewMode] = useState<'photos' | 'categories'>('photos');
  
  const { toast } = useToast();
  const { isConnected } = useDirectGoogleDrive();

  // Load photos from Google Drive
  useEffect(() => {
    if (isConnected) {
      loadPhotos();
    }
  }, [isConnected, folderId]);

  const loadPhotos = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('google_access_token');
      console.log('PhotoCategorizer - Token exists:', !!token);
      console.log('PhotoCategorizer - FolderId:', folderId);
      
      if (!token) throw new Error('No access token - please connect to Google Drive first');

      const folderQuery = folderId ? `'${folderId}' in parents and ` : '';
      const query = `${folderQuery}mimeType contains 'image/' and trashed = false`;
      console.log('PhotoCategorizer - Query:', query);
      
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,createdTime,modifiedTime,thumbnailLink,webViewLink)&pageSize=100&orderBy=createdTime desc`;
      console.log('PhotoCategorizer - API URL:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('PhotoCategorizer - Response status:', response.status);
      console.log('PhotoCategorizer - Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('PhotoCategorizer - API Error:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('PhotoCategorizer - Response data:', data);
      
      const photoFiles: PhotoFile[] = data.files.map((file: any) => ({
        id: file.id,
        name: file.name,
        thumbnailLink: file.thumbnailLink,
        webViewLink: file.webViewLink,
        size: file.size ? `${(parseInt(file.size) / 1024 / 1024).toFixed(1)} MB` : 'Unknown',
        createdTime: new Date(file.createdTime).toLocaleDateString(),
        modifiedTime: new Date(file.modifiedTime).toLocaleDateString(),
      }));

      console.log('PhotoCategorizer - Processed photos:', photoFiles.length);
      setPhotos(photoFiles);
      toast({
        title: "Photos loaded",
        description: `Found ${photoFiles.length} photos to categorize`,
      });
    } catch (error) {
      console.error('PhotoCategorizer - Error loading photos:', error);
      toast({
        title: "Error loading photos",
        description: error instanceof Error ? error.message : "Failed to fetch photos from Google Drive",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const analyzePhotos = async () => {
    const unanalyzedPhotos = photos.filter(photo => !photo.analysis);
    
    if (unanalyzedPhotos.length === 0) {
      toast({
        title: "No photos to analyze",
        description: "All photos have already been analyzed",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      console.log('PhotoCategorizer - API Key exists:', !!apiKey);
      console.log('PhotoCategorizer - API Key length:', apiKey?.length);
      
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please set VITE_OPENAI_API_KEY environment variable.');
      }

      let processedCount = 0;
      console.log('PhotoCategorizer - Starting analysis of', unanalyzedPhotos.length, 'photos');

      for (const photo of unanalyzedPhotos) {
        try {
          const imageUrl = photo.thumbnailLink || photo.webViewLink;
          console.log('PhotoCategorizer - Analyzing photo:', photo.name, 'URL:', imageUrl);
          
          const requestBody = {
            model: "gpt-4o-mini",
            messages: [{
              role: "user",
              content: [
                { 
                  type: "text", 
                  text: "Analyze this image and return a JSON object with the following structure: {\"categories\": [\"category1\", \"category2\"], \"colors\": [\"color1\", \"color2\"], \"faces\": 0, \"landmarks\": [], \"objects\": [\"object1\", \"object2\"], \"scene\": \"indoor/outdoor/people/food/event/travel/general\", \"confidence\": 0.85}. Provide 2-5 categories, 1-3 dominant colors, count of faces, any landmarks, 2-5 main objects, scene type, and confidence score." 
                },
                { 
                  type: "image_url", 
                  image_url: { url: imageUrl } 
                }
              ]
            }],
            max_tokens: 500
          };
          
          console.log('PhotoCategorizer - Request body:', JSON.stringify(requestBody, null, 2));
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          });

          console.log('PhotoCategorizer - OpenAI Response status:', response.status);
          console.log('PhotoCategorizer - OpenAI Response headers:', Object.fromEntries(response.headers.entries()));

          if (!response.ok) {
            const errorText = await response.text();
            console.error('PhotoCategorizer - OpenAI API error response:', errorText);
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          const data = await response.json();
          const analysisText = data.choices[0].message.content;
          
          // Parse JSON response
          let analysis;
          try {
            analysis = JSON.parse(analysisText);
          } catch (parseError) {
            console.error('Failed to parse analysis:', analysisText);
            // Fallback analysis
            analysis = {
              categories: ['unanalyzed'],
              colors: ['unknown'],
              faces: 0,
              landmarks: [],
              objects: ['unknown'],
              scene: 'general',
              confidence: 0.5
            };
          }

          // Update photo with analysis results
          setPhotos(prev => prev.map(p => {
            if (p.id === photo.id) {
              return {
                ...p,
                analysis: {
                  categories: analysis.categories || [],
                  colors: analysis.colors || [],
                  faces: analysis.faces || 0,
                  landmarks: analysis.landmarks || [],
                  objects: analysis.objects || [],
                  scene: analysis.scene || 'general',
                  confidence: analysis.confidence || 0.5
                }
              };
            }
            return p;
          }));

          processedCount++;
          setAnalysisProgress((processedCount / unanalyzedPhotos.length) * 100);

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.error(`Error analyzing ${photo.name}:`, error);
          // Continue with other photos
        }
      }

      // Auto-generate categories based on analysis
      generateSmartCategories();

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

  const generateSmartCategories = () => {
    const analyzedPhotos = photos.filter(photo => photo.analysis);
    if (analyzedPhotos.length === 0) return;

    const categoryMap = new Map<string, PhotoFile[]>();

    // Categorize by scene types
    analyzedPhotos.forEach(photo => {
      const scene = photo.analysis!.scene;
      if (!categoryMap.has(scene)) {
        categoryMap.set(scene, []);
      }
      categoryMap.get(scene)!.push(photo);
    });

    // Categorize by dominant colors
    analyzedPhotos.forEach(photo => {
      photo.analysis!.colors.forEach(color => {
        const colorCategory = `${color} tones`;
        if (!categoryMap.has(colorCategory)) {
          categoryMap.set(colorCategory, []);
        }
        categoryMap.get(colorCategory)!.push(photo);
      });
    });

    // Categorize by objects
    analyzedPhotos.forEach(photo => {
      photo.analysis!.objects.forEach(object => {
        if (!categoryMap.has(object)) {
          categoryMap.set(object, []);
        }
        categoryMap.get(object)!.push(photo);
      });
    });

    // Convert to categories array
    const newCategories: Category[] = Array.from(categoryMap.entries())
      .filter(([_, photos]) => photos.length >= 2) // Only create categories with 2+ photos
      .map(([name, photos]) => ({
        id: `category-${Date.now()}-${Math.random()}`,
        name,
        description: `Photos categorized by ${name}`,
        photoCount: photos.length,
        photos
      }))
      .sort((a, b) => b.photoCount - a.photoCount);

    setCategories(newCategories);
  };

  const createCustomCategory = () => {
    if (!newCategoryName.trim()) return;

    const selectedPhotosList = photos.filter(photo => selectedPhotos.has(photo.id));
    if (selectedPhotosList.length === 0) {
      toast({
        title: "No photos selected",
        description: "Select photos to create a category",
        variant: "destructive",
      });
      return;
    }

    const newCategory: Category = {
      id: `custom-${Date.now()}`,
      name: newCategoryName,
      description: `Custom category with ${selectedPhotosList.length} photos`,
      photoCount: selectedPhotosList.length,
      photos: selectedPhotosList
    };

    setCategories(prev => [newCategory, ...prev]);
    setSelectedPhotos(new Set());
    setNewCategoryName("");
    setShowCreateCategory(false);

    toast({
      title: "Category created",
      description: `"${newCategoryName}" created with ${selectedPhotosList.length} photos`,
    });
  };

  const togglePhotoSelection = (photoId: string) => {
    const newSelection = new Set(selectedPhotos);
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId);
    } else {
      newSelection.add(photoId);
    }
    setSelectedPhotos(newSelection);
  };

  const filteredPhotos = photos.filter(photo =>
    photo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    photo.analysis?.categories.some(cat => 
      cat.toLowerCase().includes(searchQuery.toLowerCase())
    ) ||
    photo.analysis?.objects.some(obj => 
      obj.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              AI Photo Categorizer
            </CardTitle>
            <CardDescription>
              Organize your photos by content, style, colors, and themes using AI vision
            </CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="glass hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button
            variant={viewMode === 'photos' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('photos')}
            className={viewMode === 'photos' ? "glass bg-white/10 border-white/20" : "glass hover:bg-white/10"}
          >
            <Image className="h-4 w-4 mr-2" />
            Photos ({photos.length})
          </Button>
          
          <Button
            variant={viewMode === 'categories' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('categories')}
            className={viewMode === 'categories' ? "glass bg-white/10 border-white/20" : "glass hover:bg-white/10"}
          >
            <Tags className="h-4 w-4 mr-2" />
            Categories ({categories.length})
          </Button>

          <Button
            onClick={analyzePhotos}
            disabled={isAnalyzing || photos.length === 0}
            size="sm"
            className="glass hover:bg-white/10"
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            AI Analyze
          </Button>

          <Button
            onClick={() => setShowCreateCategory(!showCreateCategory)}
            disabled={selectedPhotos.size === 0}
            size="sm"
            className="glass hover:bg-white/10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Category
          </Button>

          <Button
            onClick={loadPhotos}
            disabled={isLoading}
            size="sm"
            className="glass hover:bg-white/10"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search photos by content, objects, colors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 glass border-primary/30"
          />
        </div>

        {/* Create Category Form */}
        {showCreateCategory && (
          <Card className="glass border-primary/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Input
                  placeholder="Category name (e.g., 'Beach Vacation', 'Red Outfits')"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  onClick={createCustomCategory}
                  className="glass hover:bg-white/10"
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => setShowCreateCategory(false)}
                  className="glass hover:bg-white/10"
                >
                  Cancel
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {selectedPhotos.size} photos selected
              </p>
            </CardContent>
          </Card>
        )}

        {/* Analysis Progress */}
        {isAnalyzing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Analyzing photos with AI...</span>
              <span>{Math.round(analysisProgress)}%</span>
            </div>
            <Progress value={analysisProgress} />
          </div>
        )}

        {/* Photos View */}
        {viewMode === 'photos' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPhotos.map((photo) => (
              <Card 
                key={photo.id}
                className={`cursor-pointer transition-all hover:shadow-lg glass ${
                  selectedPhotos.has(photo.id) ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => togglePhotoSelection(photo.id)}
              >
                <div className="aspect-square relative overflow-hidden rounded-t-lg">
                  <img
                    src={photo.thumbnailLink || photo.webViewLink}
                    alt={photo.name}
                    className="w-full h-full object-cover"
                  />
                  {selectedPhotos.has(photo.id) && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </div>
                
                <CardContent className="p-4">
                  <h4 className="font-medium text-sm truncate mb-2">{photo.name}</h4>
                  
                  {photo.analysis ? (
                    <div className="space-y-2">
                      <Badge variant="secondary" className="text-xs">
                        {photo.analysis.scene}
                      </Badge>
                      
                      <div className="flex flex-wrap gap-1">
                        {photo.analysis.categories.slice(0, 2).map((category) => (
                          <Badge key={category} variant="outline" className="text-xs">
                            {category}
                          </Badge>
                        ))}
                      </div>

                      {photo.analysis.faces > 0 && (
                        <div className="flex items-center gap-1 text-xs">
                          <Users className="w-3 h-3" />
                          <span>{photo.analysis.faces} people</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Click "AI Analyze" to categorize
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Categories View */}
        {viewMode === 'categories' && (
          <div className="space-y-4">
            {categories.map((category) => (
              <Card key={category.id} className="glass">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      <CardDescription>{category.description}</CardDescription>
                    </div>
                    <Badge variant="outline">{category.photoCount} photos</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {category.photos.slice(0, 8).map((photo) => (
                      <div key={photo.id} className="aspect-square rounded-lg overflow-hidden">
                        <img
                          src={photo.thumbnailLink || photo.webViewLink}
                          alt={photo.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {category.photos.length > 8 && (
                      <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">
                          +{category.photos.length - 8}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {photos.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Camera className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No photos found</h3>
            <p className="text-muted-foreground mb-6">
              {folderId 
                ? "No photos found in the selected folder"
                : "Connect to Google Drive and refresh to load photos"
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PhotoCategorizer;