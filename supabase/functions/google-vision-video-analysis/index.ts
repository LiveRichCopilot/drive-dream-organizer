import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, accessToken, fileName } = await req.json();
    
    if (!fileId || !accessToken) {
      return new Response(JSON.stringify({ 
        error: 'File ID and access token required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const googleVisionApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!googleVisionApiKey) {
      return new Response(JSON.stringify({ 
        error: 'Google Vision API key not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🎬 Starting video analysis for ${fileName || fileId}...`);

    // Step 1: Get video metadata from Google Drive to extract thumbnail
    const driveMetadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,videoMediaMetadata,name`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    );

    if (!driveMetadataResponse.ok) {
      throw new Error(`Failed to get video metadata: ${driveMetadataResponse.status}`);
    }

    const driveMetadata = await driveMetadataResponse.json();
    console.log(`📊 Video metadata:`, driveMetadata);

    // Step 2: Extract frames from video for analysis
    // For now, we'll use the thumbnail from Google Drive
    let thumbnailUrl = driveMetadata.thumbnailLink;
    
    if (thumbnailUrl) {
      // Add access token to thumbnail URL for authenticated access
      thumbnailUrl = `${thumbnailUrl}&access_token=${accessToken}`;
      
      console.log(`🖼️ Analyzing video thumbnail...`);

      // Step 3: Use Google Vision API to analyze the video frame
      const visionResponse = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${googleVisionApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                image: {
                  source: {
                    imageUri: thumbnailUrl
                  }
                },
                features: [
                  {
                    type: 'LABEL_DETECTION',
                    maxResults: 10
                  },
                  {
                    type: 'OBJECT_LOCALIZATION',
                    maxResults: 10
                  },
                  {
                    type: 'SAFE_SEARCH_DETECTION'
                  },
                  {
                    type: 'IMAGE_PROPERTIES'
                  }
                ]
              }
            ]
          })
        }
      );

      if (!visionResponse.ok) {
        const errorText = await visionResponse.text();
        console.error(`❌ Google Vision API error: ${visionResponse.status} - ${errorText}`);
        throw new Error(`Google Vision API error: ${visionResponse.status}`);
      }

      const visionResult = await visionResponse.json();
      console.log(`🔍 Vision analysis complete:`, visionResult);

      // Step 4: Process the analysis results
      const analysis = visionResult.responses[0];
      
      // Extract labels and objects
      const labels = analysis.labelAnnotations?.map(label => ({
        description: label.description,
        score: label.score,
        confidence: Math.round(label.score * 100)
      })) || [];

      const objects = analysis.localizedObjectAnnotations?.map(obj => ({
        name: obj.name,
        score: obj.score,
        confidence: Math.round(obj.score * 100)
      })) || [];

      // Get dominant colors
      const colors = analysis.imagePropertiesAnnotation?.dominantColors?.colors?.slice(0, 3).map(color => ({
        red: Math.round(color.color.red || 0),
        green: Math.round(color.color.green || 0),
        blue: Math.round(color.color.blue || 0),
        score: color.score
      })) || [];

      // Generate a descriptive summary
      const topLabels = labels.slice(0, 5).map(l => l.description.toLowerCase());
      const topObjects = objects.slice(0, 3).map(o => o.name.toLowerCase());
      
      let description = "";
      if (topLabels.length > 0) {
        description = `Video appears to show ${topLabels.join(", ")}`;
        if (topObjects.length > 0) {
          description += ` with visible ${topObjects.join(", ")}`;
        }
      }

      // Detect video type based on labels
      let videoType = "general";
      const labelText = topLabels.join(" ");
      
      if (labelText.includes("person") || labelText.includes("people") || labelText.includes("human")) {
        videoType = "people";
      } else if (labelText.includes("animal") || labelText.includes("dog") || labelText.includes("cat")) {
        videoType = "animals";
      } else if (labelText.includes("landscape") || labelText.includes("sky") || labelText.includes("nature")) {
        videoType = "landscape";
      } else if (labelText.includes("food") || labelText.includes("meal")) {
        videoType = "food";
      } else if (labelText.includes("event") || labelText.includes("party") || labelText.includes("celebration")) {
        videoType = "event";
      } else if (labelText.includes("travel") || labelText.includes("building") || labelText.includes("architecture")) {
        videoType = "travel";
      }

      const result = {
        success: true,
        analysis: {
          description,
          videoType,
          labels: labels.slice(0, 10),
          objects: objects.slice(0, 5),
          colors,
          confidence: labels.length > 0 ? Math.round(labels[0].score * 100) : 0,
          safeSearch: analysis.safeSearchAnnotation,
          analysisMethod: 'google_vision_thumbnail'
        },
        fileName: fileName || `file_${fileId}`,
        fileId
      };

      console.log(`✅ Analysis complete for ${fileName}:`, result.analysis.description);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });

    } else {
      // No thumbnail available
      return new Response(JSON.stringify({
        success: false,
        error: 'No thumbnail available for analysis',
        analysis: {
          description: 'Video content could not be analyzed (no thumbnail)',
          videoType: 'unknown',
          analysisMethod: 'no_thumbnail'
        },
        fileName: fileName || `file_${fileId}`,
        fileId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

  } catch (error) {
    console.error('💥 Error in video analysis:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      analysis: {
        description: 'Analysis failed due to error',
        videoType: 'error',
        analysisMethod: 'error'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});