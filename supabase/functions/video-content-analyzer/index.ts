import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { fileId, fileName, accessToken, analysisType = 'comprehensive' } = await req.json();
    
    if (!fileId || !accessToken) {
      return new Response(JSON.stringify({ 
        error: 'File ID and access token required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ 
        error: 'OpenAI API key not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🎬 Starting comprehensive video analysis for ${fileName || fileId}...`);

    // Step 1: Get video metadata and download URL from Google Drive
    const driveMetadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,videoMediaMetadata,thumbnailLink,webContentLink`,
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

     // Step 2: Get frames from the video for analysis
    const frames = await extractVideoFrames(fileId, accessToken, 3); // Get 3 frames for better analysis
    console.log(`🎞️ Extracted ${frames.length} frames for analysis`);
    
    if (frames.length === 0) {
      throw new Error('No frames could be extracted from video');
    }
    
    // Step 3: Analyze frame with OpenAI Vision
    const frameAnalyses = [];
    for (const frame of frames) {
      const analysis = await analyzeFrameWithOpenAI(frame, openaiApiKey);
      frameAnalyses.push(analysis);
      
      // If analysis failed, try to continue but log the issue
      if (!analysis.success) {
        console.warn(`⚠️ Frame analysis failed: ${analysis.error}`);
      }
    }
    
    // Ensure we have at least one successful analysis
    const successfulAnalyses = frameAnalyses.filter(a => a.success);
    if (successfulAnalyses.length === 0) {
      throw new Error('All frame analyses failed');
    }

    // Step 4: Synthesize comprehensive video description
    const videoAnalysis = await synthesizeVideoAnalysis(frameAnalyses, driveMetadata, openaiApiKey);

    // Step 5: Generate VEO 3 prompts
    const veoPrompts = await generateVEO3Prompts(videoAnalysis, openaiApiKey);

    const result = {
      success: true,
      fileId,
      fileName: fileName || driveMetadata.name,
      analysis: {
        description: videoAnalysis.description,
        detailedDescription: videoAnalysis.detailedDescription,
        scenes: videoAnalysis.scenes,
        visualStyle: videoAnalysis.visualStyle,
        subjects: videoAnalysis.subjects,
        mood: videoAnalysis.mood,
        cameraWork: videoAnalysis.cameraWork,
        lighting: videoAnalysis.lighting,
        setting: videoAnalysis.setting,
        confidence: videoAnalysis.confidence
      },
      veo3Prompts: veoPrompts,
      metadata: {
        duration: driveMetadata.videoMediaMetadata?.durationMillis ? 
          Math.round(parseInt(driveMetadata.videoMediaMetadata.durationMillis) / 1000) : null,
        resolution: driveMetadata.videoMediaMetadata ? {
          width: parseInt(driveMetadata.videoMediaMetadata.width || 0),
          height: parseInt(driveMetadata.videoMediaMetadata.height || 0)
        } : null,
        fileSize: parseInt(driveMetadata.size || 0)
      },
      processingTime: Date.now(),
      analysisMethod: 'openai_multi_frame'
    };

    console.log(`✅ Comprehensive analysis complete for ${fileName}:`, result.analysis.description);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('💥 Error in video content analysis:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      analysis: {
        description: 'Analysis failed due to error',
        analysisMethod: 'error'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function extractVideoFrames(fileId: string, accessToken: string, frameCount: number): Promise<string[]> {
  try {
    console.log(`🎬 Extracting actual frames from video: ${fileId}`);
    
    // Call our dedicated frame extraction function
    const frameResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/video-frame-extractor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        accessToken,
        frameCount
      })
    });

    if (frameResponse.ok) {
      const frameData = await frameResponse.json();
      if (frameData.success && frameData.frames.length > 0) {
        console.log(`🖼️ Successfully extracted ${frameData.frames.length} actual video frames`);
        return frameData.frames;
      }
    }
    
    console.log('⚠️ Frame extraction failed, falling back to enhanced thumbnail analysis');
    
    // Enhanced fallback: Get multiple thumbnail variants at different qualities
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,videoMediaMetadata`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    );

    if (metadataResponse.ok) {
      const data = await metadataResponse.json();
      if (data.thumbnailLink) {
        // Get multiple quality levels to maximize information
        const frames = [];
        const qualities = [
          { size: 1600, param: '=s1600' },  // Highest quality
          { size: 800, param: '=s800' },    // Medium quality  
          { size: 400, param: '=s400' }     // Lower quality for different perspective
        ];
        
        for (const quality of qualities) {
          const frameUrl = data.thumbnailLink.replace(/=s\d+/, quality.param);
          frames.push(frameUrl);
        }
        
        console.log(`🖼️ Using ${frames.length} enhanced thumbnail variants for analysis`);
        return frames;
      }
    }

    throw new Error('Could not extract any frames from video');
  } catch (error) {
    console.error('Frame extraction completely failed:', error);
    throw error;
  }
}

async function analyzeFrameWithOpenAI(imageUrl: string, apiKey: string): Promise<any> {
  try {
    console.log(`🔍 Analyzing frame with OpenAI Vision...`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this video thumbnail/frame in detail. Even though this may be a thumbnail, provide as much detail as possible about:

1) CONTENT: What objects, people, animals, or scenes do you see?
2) SETTING: Indoor/outdoor location, specific environment details
3) VISUAL STYLE: Colors, lighting (natural/artificial/dramatic), overall mood
4) CAMERA WORK: Angle (close-up/wide/medium), perspective, framing
5) SUBJECTS: Main focus - people, objects, activities happening
6) TEXT/GRAPHICS: Any visible text, logos, or graphics

Be specific and descriptive. If this appears to be a video thumbnail, imagine what the full video might contain based on what you can see.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 800,
        temperature: 0.2
      })
    });

    if (response.ok) {
      const data = await response.json();
      const description = data.choices[0].message.content;
      console.log(`✅ Frame analysis successful: ${description.substring(0, 100)}...`);
      
      return {
        description,
        timestamp: 0,
        success: true
      };
    } else {
      const errorText = await response.text();
      console.error(`❌ OpenAI Vision API error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI Vision API error: ${response.status}`);
    }
  } catch (error) {
    console.error(`💥 Frame analysis failed:`, error);
    return {
      description: 'Frame analysis failed due to technical error',
      timestamp: 0,
      success: false,
      error: error.message
    };
  }
}

async function synthesizeVideoAnalysis(frameAnalyses: any[], metadata: any, apiKey: string): Promise<any> {
  try {
    // Filter out failed analyses and get descriptions
    const successfulAnalyses = frameAnalyses.filter(f => f.success && f.description);
    const allDescriptions = successfulAnalyses.map(f => f.description).join('\n\n');
    
    if (!allDescriptions) {
      throw new Error('No successful frame analyses to synthesize');
    }
    
    console.log(`🧠 Synthesizing analysis from ${successfulAnalyses.length} successful frame(s)...`);
    
    const duration = metadata.videoMediaMetadata?.durationMillis ? 
      Math.round(parseInt(metadata.videoMediaMetadata.durationMillis) / 1000) : null;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a professional video content analyst. Create detailed, accurate descriptions based on visual analysis. Be specific and avoid generic terms.'
          },
          {
            role: 'user',
            content: `Analyze this video content based on frame analysis. Create a comprehensive description.

FRAME ANALYSIS:
${allDescriptions}

VIDEO METADATA:
- Filename: ${metadata.name || 'Unknown'}
- Duration: ${duration ? duration + ' seconds' : 'Unknown'}
- Resolution: ${metadata.videoMediaMetadata ? `${metadata.videoMediaMetadata.width}x${metadata.videoMediaMetadata.height}` : 'Unknown'}

Create a JSON response with detailed, specific information:
{
  "description": "Clear, specific 1-2 sentence overview of what this video shows",
  "detailedDescription": "Detailed 3-4 sentence description with specific visual details",
  "scenes": ["specific scene/activity 1", "specific scene/activity 2", "specific scene/activity 3"],
  "visualStyle": {
    "lighting": "describe the lighting style seen",
    "colorPalette": ["dominant color 1", "dominant color 2", "dominant color 3"],
    "mood": "specific mood based on visual elements"
  },
  "subjects": ["specific people/objects/animals seen"],
  "cameraWork": "describe camera angle and movement style",
  "setting": "specific location/environment description",
  "confidence": 0.85
}

IMPORTANT: Be specific and descriptive. Avoid generic terms like "unknown", "scene1", "person". Use actual visual details from the analysis.`
          }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const analysis = JSON.parse(data.choices[0].message.content);
      console.log(`✅ Video synthesis successful: ${analysis.description}`);
      return analysis;
    } else {
      const errorText = await response.text();
      console.error(`❌ Synthesis API error: ${response.status} - ${errorText}`);
      throw new Error(`Analysis synthesis failed: ${response.status}`);
    }
  } catch (error) {
    console.error(`💥 Video synthesis failed:`, error);
    
    // Return a more informative fallback based on metadata
    const duration = metadata.videoMediaMetadata?.durationMillis ? 
      Math.round(parseInt(metadata.videoMediaMetadata.durationMillis) / 1000) : null;
    
    return {
      description: `Video file ${metadata.name || 'Unknown'} with ${duration ? duration + ' second' : 'unknown'} duration`,
      detailedDescription: `This is a ${duration ? duration + '-second' : 'short'} video file. Technical analysis was limited but the file appears to be a valid video recording.`,
      scenes: [`${duration ? duration + '-second' : 'Brief'} video content`],
      visualStyle: { 
        lighting: 'unknown', 
        colorPalette: [], 
        mood: 'undetermined' 
      },
      subjects: ['video content'],
      cameraWork: 'undetermined',
      setting: 'undetermined',
      confidence: 0.3,
      error: error.message
    };
  }
}

async function generateVEO3Prompts(analysis: any, apiKey: string): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating video generation prompts for Google VEO 3. Create professional, detailed prompts that capture visual style, camera work, and content.'
        },
        {
          role: 'user',
          content: `Based on this video analysis, create VEO 3 prompts:

Description: ${analysis.description}
Detailed: ${analysis.detailedDescription}
Visual Style: ${JSON.stringify(analysis.visualStyle)}
Camera Work: ${analysis.cameraWork}
Setting: ${analysis.setting}
Subjects: ${analysis.subjects?.join(', ')}

Create JSON response with:
{
  "professional": "Professional prompt for commercial use",
  "creative": "Creative/artistic interpretation",
  "technical": "Technical prompt with camera specs",
  "short": "Concise 50-word prompt",
  "detailed": "Detailed 150+ word prompt"
}`
        }
      ],
      temperature: 0.4,
      response_format: { type: "json_object" }
    })
  });

  if (response.ok) {
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  return {
    professional: 'Professional video prompt generation failed',
    creative: 'Creative prompt generation failed',
    technical: 'Technical prompt generation failed',
    short: 'Short prompt generation failed',
    detailed: 'Detailed prompt generation failed'
  };
}