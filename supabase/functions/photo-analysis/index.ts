import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PhotoAnalysisRequest {
  imageUrl: string;
  fileName: string;
}

interface AnalysisResult {
  fileName: string;
  categories: string[];
  colors: string[];
  faces: number;
  landmarks: string[];
  objects: string[];
  text: string[];
  scene: string;
  confidence: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images }: { images: PhotoAnalysisRequest[] } = await req.json();
    const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');

    if (!apiKey) {
      throw new Error('Google Vision API key not configured');
    }

    if (!images || images.length === 0) {
      throw new Error('No images provided for analysis');
    }

    // Process up to 16 images in batch for cost efficiency
    const batchSize = Math.min(images.length, 16);
    const imagesToProcess = images.slice(0, batchSize);
    
    const results: AnalysisResult[] = [];

    for (const image of imagesToProcess) {
      try {
        // Download image and convert to base64
        const imageResponse = await fetch(image.imageUrl);
        if (!imageResponse.ok) {
          console.error(`Failed to fetch image: ${image.fileName}`);
          continue;
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

        // Prepare Vision API request with multiple feature types
        const visionRequest = {
          requests: [{
            image: {
              content: base64Image
            },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'IMAGE_PROPERTIES' },
              { type: 'FACE_DETECTION', maxResults: 10 },
              { type: 'LANDMARK_DETECTION', maxResults: 5 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
              { type: 'TEXT_DETECTION', maxResults: 5 }
            ]
          }]
        };

        const visionResponse = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(visionRequest)
          }
        );

        if (!visionResponse.ok) {
          const errorText = await visionResponse.text();
          console.error(`Vision API error for ${image.fileName}:`, errorText);
          continue;
        }

        const visionData = await visionResponse.json();
        const annotation = visionData.responses[0];

        // Extract labels and categories
        const labels = annotation.labelAnnotations || [];
        const categories = labels
          .filter((label: any) => label.score > 0.7)
          .map((label: any) => label.description)
          .slice(0, 5);

        // Extract dominant colors
        const colors = annotation.imagePropertiesAnnotation?.dominantColors?.colors
          ?.slice(0, 3)
          ?.map((color: any) => {
            const rgb = color.color;
            return `rgb(${Math.round(rgb.red || 0)}, ${Math.round(rgb.green || 0)}, ${Math.round(rgb.blue || 0)})`;
          }) || [];

        // Count faces
        const faces = annotation.faceAnnotations?.length || 0;

        // Extract landmarks
        const landmarks = annotation.landmarkAnnotations
          ?.map((landmark: any) => landmark.description)
          ?.slice(0, 3) || [];

        // Extract objects
        const objects = annotation.localizedObjectAnnotations
          ?.filter((obj: any) => obj.score > 0.6)
          ?.map((obj: any) => obj.name)
          ?.slice(0, 5) || [];

        // Extract text
        const textAnnotations = annotation.textAnnotations || [];
        const extractedText = textAnnotations.length > 0 
          ? [textAnnotations[0].description.slice(0, 100)] 
          : [];

        // Determine scene type based on labels
        const sceneKeywords = {
          'indoor': ['room', 'furniture', 'interior', 'ceiling', 'wall', 'floor'],
          'outdoor': ['sky', 'tree', 'grass', 'landscape', 'nature', 'mountain'],
          'people': ['person', 'people', 'face', 'human', 'crowd'],
          'food': ['food', 'meal', 'restaurant', 'kitchen', 'plate'],
          'event': ['party', 'celebration', 'wedding', 'concert', 'festival'],
          'travel': ['landmark', 'building', 'monument', 'tourist', 'vacation']
        };

        let scene = 'general';
        let maxMatches = 0;

        for (const [sceneType, keywords] of Object.entries(sceneKeywords)) {
          const matches = categories.filter(cat => 
            keywords.some(keyword => cat.toLowerCase().includes(keyword.toLowerCase()))
          ).length;
          
          if (matches > maxMatches) {
            maxMatches = matches;
            scene = sceneType;
          }
        }

        // Calculate overall confidence
        const avgConfidence = labels.length > 0 
          ? labels.reduce((sum: number, label: any) => sum + label.score, 0) / labels.length
          : 0.5;

        results.push({
          fileName: image.fileName,
          categories,
          colors,
          faces,
          landmarks,
          objects,
          text: extractedText,
          scene,
          confidence: Math.round(avgConfidence * 100) / 100
        });

        console.log(`Analyzed ${image.fileName}: ${categories.join(', ')}`);

      } catch (error) {
        console.error(`Error analyzing ${image.fileName}:`, error);
        // Continue with other images even if one fails
      }
    }

    return new Response(
      JSON.stringify({ 
        results,
        processed: results.length,
        skipped: images.length - results.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Photo analysis error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Photo analysis failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});