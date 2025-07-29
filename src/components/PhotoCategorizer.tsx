import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PhotoInfoPanel } from "@/components/ui/photo-info-panel";
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
import { sendGmailMessage, getUserEmail } from "@/lib/gmailApi";

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
    prompt?: string; // AI generation prompt extracted from analysis
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
  const [analyzingPhotoId, setAnalyzingPhotoId] = useState<string | null>(null);
  const [folderScanProgress, setFolderScanProgress] = useState<{current: number, total: number} | null>(null);
  
  // Use refs to maintain analysis state across re-renders
  const analysisStateRef = useRef({
    isRunning: false,
    currentBatch: 0,
    processedCount: 0,
    shouldStop: false
  });
  
  const { toast } = useToast();
  const { isConnected } = useDirectGoogleDrive();

  // Load photos from Google Drive
  useEffect(() => {
    if (isConnected) {
      loadPhotos();
    }
  }, [isConnected, folderId]);

  const loadPhotos = async () => {
    // Only proceed if properly connected through the authentication flow
    if (!isConnected) {
      console.log('PhotoCategorizer - Not connected, skipping photo load');
      return;
    }
    
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

  // Extract photo metadata including EXIF data
  const getPhotoMetadata = async (file: PhotoFile) => {
    try {
      console.log('Extracting metadata for:', file.name);
      
      // Get creation date from Google Drive file metadata
      const createdDate = file.createdTime || file.modifiedTime;
      
      // For more detailed EXIF data, call video-metadata service
      if (file.name.toLowerCase().match(/\.(jpg|jpeg|png|tiff|raw|heic)$/)) {
        const response = await fetch('https://video-metadata-service-1070421026009.us-central1.run.app/extract-metadata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            fileId: file.id,
            fileName: file.name
          })
        });
        
        if (response.ok) {
          const metadata = await response.json();
          console.log('EXIF metadata extracted:', metadata);
          return { 
            createdDate, 
            exifData: metadata,
            hasExif: true
          };
        }
      }
      
      return { 
        createdDate, 
        exifData: null,
        hasExif: false
      };
    } catch (error) {
      console.error('Metadata extraction failed for', file.name, ':', error);
      return { 
        createdDate: file.createdTime || file.modifiedTime, 
        exifData: null,
        hasExif: false,
        error: error.message
      };
    }
  };

  // Send batch completion email using Gmail API
  const sendBatchCompleteEmail = async (batchInfo: {
    current: number;
    total: number;
    start: number;
    end: number;
    categories: string[];
  }) => {
    try {
      // Get user's actual email from Google API
      let userEmail = localStorage.getItem('user_email');
      if (!userEmail) {
        try {
          userEmail = await getUserEmail();
          localStorage.setItem('user_email', userEmail);
        } catch (error) {
          console.error('Failed to get user email:', error);
          userEmail = 'user@example.com'; // fallback
        }
      }
      
      const message = {
        to: userEmail,
        subject: `Photo Agent - Batch ${batchInfo.current}/${batchInfo.total} Complete ✅`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333; border-bottom: 2px solid #4CAF50;">🎉 Batch Processing Complete</h2>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>📊 Batch Results</h3>
              <p><strong>✅ Processed:</strong> Photos ${batchInfo.start}-${batchInfo.end}</p>
              <p><strong>📁 Progress:</strong> Batch ${batchInfo.current} of ${batchInfo.total}</p>
              <p><strong>🏷️ Categories found:</strong> ${batchInfo.categories.slice(0, 10).join(', ')}</p>
              ${batchInfo.categories.length > 10 ? `<p><em>...and ${batchInfo.categories.length - 10} more categories</em></p>` : ''}
            </div>
            
            <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>⚡ Auto-Processing Status</h3>
              <p>${batchInfo.current < batchInfo.total ? 
                '🔄 <strong>Next batch starting automatically...</strong><br>Processing continues in background!' :
                '🎊 <strong>All batches complete!</strong><br>Your entire photo collection has been analyzed.'
              }</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${window.location.origin}" style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Results in App
              </a>
            </div>
          </div>
        `
      };
      
      // Use existing Gmail API integration
      await sendGmailMessage(message);
      
      console.log(`Batch ${batchInfo.current} email notification sent`);
      
    } catch (error) {
      console.error('Failed to send batch email:', error);
      // Don't fail the batch processing if email fails
    }
  };

  // Folder scan with batch processing and Gmail notifications
  const scanAndAnalyzeFolder = async () => {
    const unanalyzedPhotos = photos.filter(photo => !photo.analysis);
    
    if (unanalyzedPhotos.length === 0) {
      toast({
        title: "No photos to analyze",
        description: "All photos have already been analyzed",
      });
      return;
    }

    // Check if analysis is already running
    if (analysisStateRef.current.isRunning) {
      toast({
        title: "Analysis already running",
        description: "Please wait for the current analysis to complete",
      });
      return;
    }

    // Set persistent analysis state
    analysisStateRef.current = {
      isRunning: true,
      currentBatch: 0,
      processedCount: 0,
      shouldStop: false
    };

    setIsAnalyzing(true);
    setFolderScanProgress({ current: 0, total: unanalyzedPhotos.length });

    try {
      // Get API key from Supabase edge function (secure access to secrets)
      console.log('🔑 Fetching OpenAI API key from Supabase secrets...');
      const keyResponse = await fetch(`https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1/get-openai-key`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`
        }
      });
      
      if (!keyResponse.ok) {
        const errorData = await keyResponse.json();
        console.error('❌ Failed to get API key from Supabase:', errorData);
        throw new Error(`Failed to retrieve OpenAI API key: ${errorData.message || 'Unknown error'}`);
      }
      
      const keyData = await keyResponse.json();
      const apiKey = keyData.apiKey;
      
      if (!apiKey) {
        console.error('❌ API key is empty in response');
        throw new Error('OpenAI API key is empty - please check your Supabase secrets configuration');
      }
      
      console.log('✅ OpenAI API key successfully retrieved and ready for photo analysis');

      const batchSize = 100;
      const totalBatches = Math.ceil(unanalyzedPhotos.length / batchSize);
      let allDiscoveredCategories = new Set<string>();
      
      console.log('PhotoCategorizer - Starting batch processing:', unanalyzedPhotos.length, 'photos in', totalBatches, 'batches');

      for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
        const startIndex = (batchNum - 1) * batchSize;
        const endIndex = Math.min(startIndex + batchSize, unanalyzedPhotos.length);
        const currentBatch = unanalyzedPhotos.slice(startIndex, endIndex);
        
        console.log(`Processing batch ${batchNum}/${totalBatches} - photos ${startIndex + 1} to ${endIndex}`);
        
        // Process current batch
        for (const photo of currentBatch) {
          try {
            // Extract metadata first
            const metadata = await getPhotoMetadata(photo);
            console.log('Metadata extracted for', photo.name, ':', metadata);
            
            const analysis = await analyzePhoto(photo, apiKey);
            
            // Update photo with analysis results
            setPhotos(prev => prev.map(p => {
              if (p.id === photo.id) {
                return { ...p, analysis };
              }
              return p;
            }));

            // Collect discovered categories
            analysis.categories.forEach(cat => allDiscoveredCategories.add(cat));

            // Update progress
            const totalProcessed = startIndex + currentBatch.indexOf(photo) + 1;
            setFolderScanProgress({ current: totalProcessed, total: unanalyzedPhotos.length });

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (error) {
            console.error(`Error analyzing ${photo.name}:`, error);
            // Continue with other photos
          }
        }
        
        // Auto-generate categories after each batch
        generateSmartCategories();
        
        // Send batch completion email
        await sendBatchCompleteEmail({
          current: batchNum,
          total: totalBatches,
          start: startIndex + 1,
          end: endIndex,
          categories: Array.from(allDiscoveredCategories)
        });
        
        // Show progress toast
        toast({
          title: `Batch ${batchNum}/${totalBatches} complete`,
          description: `Processed ${endIndex} of ${unanalyzedPhotos.length} photos`,
        });
        
        // Small delay between batches
        if (batchNum < totalBatches) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Final completion
      toast({
        title: "All batches complete! 🎉",
        description: `Successfully analyzed ${unanalyzedPhotos.length} photos with ${allDiscoveredCategories.size} unique categories found`,
      });

    } catch (error) {
      console.error('Folder scan error:', error);
      toast({
        title: "Batch processing failed",
        description: "Check console for details. Some photos may have been processed.",
        variant: "destructive",
      });
    } finally {
      // Reset persistent analysis state
      analysisStateRef.current.isRunning = false;
      setIsAnalyzing(false);
      setFolderScanProgress(null);
    }
  };

  // Individual photo analysis
  const analyzeIndividualPhoto = async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    setAnalyzingPhotoId(photoId);

    try {
      // Get API key from Supabase edge function (secure access to secrets)
      console.log('🔑 Fetching OpenAI API key from Supabase secrets for individual analysis...');
      const keyResponse = await fetch(`https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1/get-openai-key`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnZqdGZycWFlc29laGJ3dGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTI2MDgsImV4cCI6MjA2OTAyODYwOH0.ARZz7L06Y5xkfd-2hkRbvDrqermx88QSittVq27sw88`
        }
      });
      
      if (!keyResponse.ok) {
        const errorData = await keyResponse.json();
        console.error('❌ Failed to get API key from Supabase:', errorData);
        throw new Error(`Failed to retrieve OpenAI API key: ${errorData.message || 'Unknown error'}`);
      }
      
      const keyData = await keyResponse.json();
      const apiKey = keyData.apiKey;
      
      if (!apiKey) {
        console.error('❌ API key is empty in response');
        throw new Error('OpenAI API key is empty - please check your Supabase secrets configuration');
      }

      const analysis = await analyzePhoto(photo, apiKey);
      
      // Update photo with analysis results
      setPhotos(prev => prev.map(p => {
        if (p.id === photoId) {
          return { ...p, analysis };
        }
        return p;
      }));

      // Regenerate categories to include this photo
      generateSmartCategories();

      toast({
        title: "Photo analyzed",
        description: `"${photo.name}" has been categorized`,
      });

    } catch (error) {
      console.error('Individual photo analysis error:', error);
      toast({
        title: "Analysis failed",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setAnalyzingPhotoId(null);
    }
  };

  // Common analysis function - now downloads full resolution images
  const analyzePhoto = async (photo: PhotoFile, apiKey: string) => {
    console.log('PhotoCategorizer - Downloading and analyzing photo:', photo.name);
    
    try {
      // Download the actual file for high-quality analysis
      const token = localStorage.getItem('google_access_token');
      if (!token) throw new Error('No access token available');

      // Use Google Drive download API for full resolution
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media`;
      
      const downloadResponse = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!downloadResponse.ok) {
        throw new Error(`Failed to download photo: ${downloadResponse.status}`);
      }

      // Convert to base64 for OpenAI Vision API
      const imageBlob = await downloadResponse.blob();
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix to get pure base64
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
      });

      console.log('PhotoCategorizer - Photo downloaded, sending to OpenAI for analysis');

      const requestBody = {
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Analyze this image for organizational purposes and return a JSON object with: {\"categories\": [\"category1\", \"category2\"], \"colors\": [\"color1\", \"color2\"], \"faces\": 0, \"landmarks\": [], \"objects\": [\"object1\", \"object2\"], \"scene\": \"indoor/outdoor/people/food/event/travel/general\", \"confidence\": 0.85, \"prompt\": \"descriptive text about image content\"}. Focus on basic categorization for photo organization - clothing, locations, objects, activities, time of day, etc. Keep analysis factual and descriptive." 
            },
            { 
              type: "image_url", 
              image_url: { 
                url: `data:${imageBlob.type};base64,${base64Image}`,
                detail: "low" // Use low detail to avoid policy issues
              } 
            }
          ]
        }],
        max_tokens: 400 // Reduced for simpler responses
      };
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PhotoCategorizer - OpenAI API error response:', errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;
    
    // Parse JSON response - handle markdown code blocks
    let analysis;
    try {
      // Remove markdown code block formatting if present
      let cleanText = analysisText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      analysis = JSON.parse(cleanText);
    } catch (parseError) {
      console.log('OpenAI response was not JSON:', analysisText);
      
      // Check if it's a content policy rejection
      if (analysisText.toLowerCase().includes("i'm sorry") || 
          analysisText.toLowerCase().includes("i can't assist") ||
          analysisText.toLowerCase().includes("unable to analyze")) {
        console.log('Content policy rejection detected, creating basic analysis');
        analysis = {
          categories: ['content-filtered'],
          colors: ['unknown'],
          faces: 0,
          landmarks: [],
          objects: ['image'],
          scene: 'general',
          confidence: 0.3,
          prompt: 'Image analysis restricted due to content policy'
        };
      } else {
        // Other parsing errors
        analysis = {
          categories: ['unanalyzed'],
          colors: ['unknown'],
          faces: 0,
          landmarks: [],
          objects: ['unknown'],
          scene: 'general',
          confidence: 0.5,
          prompt: 'Failed to analyze image'
        };
      }
    }

    return {
      categories: analysis.categories || [],
      colors: analysis.colors || [],
      faces: analysis.faces || 0,
      landmarks: analysis.landmarks || [],
      objects: analysis.objects || [],
      scene: analysis.scene || 'general',
      confidence: analysis.confidence || 0.5,
      prompt: analysis.prompt || 'No prompt generated'
    };
    
    } catch (error) {
      console.error('Photo analysis error:', error);
      throw error;
    }
  };

  const generateSmartCategories = () => {
    const analyzedPhotos = photos.filter(photo => photo.analysis);
    if (analyzedPhotos.length === 0) return;

    const categoryMap = new Map<string, {photos: PhotoFile[], tags: Set<string>}>();

    // Categorize by specific detected categories (prioritized for clothing/fashion)
    analyzedPhotos.forEach(photo => {
      photo.analysis!.categories.forEach(category => {
        if (!categoryMap.has(category)) {
          categoryMap.set(category, {photos: [], tags: new Set()});
        }
        categoryMap.get(category)!.photos.push(photo);
        
        // Add related tags
        photo.analysis!.colors.forEach(color => categoryMap.get(category)!.tags.add(color));
        photo.analysis!.objects.forEach(obj => categoryMap.get(category)!.tags.add(obj));
        categoryMap.get(category)!.tags.add(photo.analysis!.scene);
      });
    });

    // Categorize by scene types (only if no specific categories found)
    analyzedPhotos.forEach(photo => {
      const scene = photo.analysis!.scene;
      if (!categoryMap.has(scene)) {
        categoryMap.set(scene, {photos: [], tags: new Set()});
      }
      if (!photo.analysis!.categories.length) {
        categoryMap.get(scene)!.photos.push(photo);
        photo.analysis!.colors.forEach(color => categoryMap.get(scene)!.tags.add(color));
        photo.analysis!.objects.forEach(obj => categoryMap.get(scene)!.tags.add(obj));
      }
    });

    // Categorize by dominant colors (for color-themed collections)
    analyzedPhotos.forEach(photo => {
      photo.analysis!.colors.forEach(color => {
        const colorCategory = `${color} colors`;
        if (!categoryMap.has(colorCategory)) {
          categoryMap.set(colorCategory, {photos: [], tags: new Set()});
        }
        categoryMap.get(colorCategory)!.photos.push(photo);
        categoryMap.get(colorCategory)!.tags.add(color);
        categoryMap.get(colorCategory)!.tags.add(photo.analysis!.scene);
      });
    });

    // Convert to categories array with enhanced descriptions
    const newCategories: Category[] = Array.from(categoryMap.entries())
      .filter(([_, data]) => data.photos.length >= 2) // Only create categories with 2+ photos
      .map(([name, data]) => {
        const uniquePhotos = data.photos.filter((photo, index, arr) => 
          arr.findIndex(p => p.id === photo.id) === index
        );
        
        const tags = Array.from(data.tags).slice(0, 5); // Limit to 5 most relevant tags
        
        return {
          id: `category-${Date.now()}-${Math.random()}`,
          name,
          description: `Tags: ${tags.join(', ')}`,
          photoCount: uniquePhotos.length,
          photos: uniquePhotos
        };
      })
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
        {/* Main Scan Button */}
        <div className="mb-4">
        <Button
          onClick={scanAndAnalyzeFolder}
          disabled={isAnalyzing || photos.length === 0}
          variant="glass"
          size="sm"
          className="bg-white/5 backdrop-blur-2xl border border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] hover:bg-white/10 transition-all duration-300"
        >
            {isAnalyzing ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5 mr-2" />
            )}
            Scan & Analyze Folder
          </Button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="glass"
            size="sm"
            onClick={() => setViewMode('photos')}
            className={`bg-gradient-to-br backdrop-blur-xl border ${
              viewMode === 'photos' 
                ? 'from-white/30 to-white/15 border-white/40 text-white shadow-md' 
                : 'from-white/15 to-white/5 border-white/20 text-white/80 hover:from-white/25 hover:to-white/10'
            }`}
          >
            <Image className="h-4 w-4 mr-2" />
            Photos ({photos.length})
          </Button>
          
          <Button
            variant="glass"
            size="sm"
            onClick={() => setViewMode('categories')}
            className={`bg-gradient-to-br backdrop-blur-xl border ${
              viewMode === 'categories' 
                ? 'from-white/30 to-white/15 border-white/40 text-white shadow-md' 
                : 'from-white/15 to-white/5 border-white/20 text-white/80 hover:from-white/25 hover:to-white/10'
            }`}
          >
            <Tags className="h-4 w-4 mr-2" />
            Categories ({categories.length})
          </Button>

          <Button
            onClick={() => setShowCreateCategory(!showCreateCategory)}
            disabled={selectedPhotos.size === 0}
            variant="glass"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Category
          </Button>

          <Button
            onClick={loadPhotos}
            disabled={isLoading}
            variant="glass"
            size="sm"
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
                  variant="glass"
                  className="bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-xl border border-white/30"
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create
                </Button>
                <Button 
                  variant="glass" 
                  onClick={() => setShowCreateCategory(false)}
                  className="bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-xl border border-white/20"
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

        {/* Folder Scan Progress */}
        {isAnalyzing && folderScanProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Analyzing folder... {folderScanProgress.current}/{folderScanProgress.total} photos</span>
              <span>{Math.round((folderScanProgress.current / folderScanProgress.total) * 100)}%</span>
            </div>
            <Progress value={(folderScanProgress.current / folderScanProgress.total) * 100} />
          </div>
        )}

        {/* Photos View */}
        {viewMode === 'photos' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPhotos.map((photo) => (
              <div key={photo.id} className="relative">
                <PhotoInfoPanel 
                  photo={photo}
                  onAnalyze={() => analyzeIndividualPhoto(photo.id)}
                  isAnalyzing={analyzingPhotoId === photo.id}
                >
                  <Card 
                    className={`cursor-pointer transition-all hover:shadow-xl hover:scale-105 glass-card border-white/20 bg-black/20 backdrop-blur-2xl ${
                      selectedPhotos.has(photo.id) ? 'ring-2 ring-white/50 shadow-[0_0_30px_rgba(255,255,255,0.3)]' : ''
                    }`}
                  >
                    <div className="aspect-square relative overflow-hidden rounded-t-xl">
                      <img
                        src={photo.thumbnailLink || photo.webViewLink}
                        alt={photo.name}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                      />
                      
                      {/* Status indicators overlay */}
                      <div className="absolute top-3 left-3 flex flex-col gap-2">
                        {photo.analysis ? (
                          <Badge 
                            variant="secondary" 
                            className="bg-emerald-500/20 border-emerald-400/30 text-emerald-100 backdrop-blur-md text-xs font-medium"
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            analyzed
                          </Badge>
                        ) : (
                          <Badge 
                            variant="outline" 
                            className="bg-amber-500/20 border-amber-400/30 text-amber-100 backdrop-blur-md text-xs"
                          >
                            unanalyzed
                          </Badge>
                        )}
                      </div>

                      {/* Selection indicator */}
                      {selectedPhotos.has(photo.id) && (
                        <div className="absolute top-3 right-3 w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                          <span className="text-white text-sm font-medium">✓</span>
                        </div>
                      )}

                      {/* Quick info overlay on hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
                        <div className="absolute bottom-3 left-3 right-3">
                          <p className="text-white text-sm font-medium truncate mb-1">{photo.name}</p>
                          {photo.analysis && (
                            <div className="flex flex-wrap gap-1">
                              {photo.analysis.categories.slice(0, 2).map((category) => (
                                <Badge 
                                  key={category} 
                                  variant="outline" 
                                  className="bg-white/10 border-white/20 text-white text-xs backdrop-blur-sm"
                                >
                                  {category}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </PhotoInfoPanel>

                {/* Selection toggle (separate from info panel) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePhotoSelection(photo.id);
                  }}
                  className="absolute bottom-3 right-3 w-8 h-8 bg-white/10 backdrop-blur-md rounded-full border border-white/20 hover:bg-white/20 transition-all duration-200 flex items-center justify-center"
                >
                  <Plus className="w-4 h-4 text-white/80" />
                </button>
              </div>
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