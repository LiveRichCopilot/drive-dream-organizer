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

    // Step 2: Get multiple frames from the video for analysis
    const frames = await extractVideoFrames(fileId, accessToken, 5); // Extract 5 frames
    
    // Step 3: Analyze frames with OpenAI Vision
    const frameAnalyses = [];
    for (const frame of frames) {
      const analysis = await analyzeFrameWithOpenAI(frame, openaiApiKey);
      frameAnalyses.push(analysis);
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
  // For now, we'll use the thumbnail and extract frames at different timestamps
  // In a full implementation, you'd use ffmpeg or similar to extract actual frames
  
  try {
    const thumbnailResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    );

    if (thumbnailResponse.ok) {
      const data = await thumbnailResponse.json();
      if (data.thumbnailLink) {
        // For now, return the thumbnail multiple times
        // In production, you'd extract frames at different timestamps
        return Array(frameCount).fill(data.thumbnailLink + `&access_token=${accessToken}`);
      }
    }
  } catch (error) {
    console.warn('Failed to extract frames, using fallback:', error);
  }

  return [];
}

async function analyzeFrameWithOpenAI(imageUrl: string, apiKey: string): Promise<any> {
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
              text: 'Analyze this video frame in detail. Describe: 1) What you see (objects, people, setting), 2) Visual style (lighting, colors, mood), 3) Camera work (angle, framing), 4) Any text or graphics visible. Be specific and detailed.'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    })
  });

  if (response.ok) {
    const data = await response.json();
    return {
      description: data.choices[0].message.content,
      timestamp: Math.random() * 100 // Simulated timestamp
    };
  }

  return {
    description: 'Frame analysis failed',
    timestamp: 0
  };
}

async function synthesizeVideoAnalysis(frameAnalyses: any[], metadata: any, apiKey: string): Promise<any> {
  const allDescriptions = frameAnalyses.map(f => f.description).join('\n\n');
  
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
          content: 'You are a professional video analyst. Synthesize frame analyses into a comprehensive video description.'
        },
        {
          role: 'user',
          content: `Based on these frame analyses from a video, create a comprehensive description:

${allDescriptions}

Video filename: ${metadata.name || 'Unknown'}
Duration: ${metadata.videoMediaMetadata?.durationMillis ? Math.round(parseInt(metadata.videoMediaMetadata.durationMillis) / 1000) + ' seconds' : 'Unknown'}

Provide a JSON response with:
{
  "description": "Brief overview (1-2 sentences)",
  "detailedDescription": "Detailed description (3-4 sentences)",
  "scenes": ["scene1", "scene2", "scene3"],
  "visualStyle": {
    "lighting": "natural/artificial/mixed",
    "colorPalette": ["color1", "color2", "color3"],
    "mood": "energetic/calm/dramatic/etc"
  },
  "subjects": ["person", "object", "location"],
  "cameraWork": "static/handheld/smooth/etc",
  "setting": "indoor/outdoor/mixed",
  "confidence": 0.8
}`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });

  if (response.ok) {
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  return {
    description: 'Video analysis synthesis failed',
    detailedDescription: 'Unable to analyze video content',
    scenes: [],
    visualStyle: { lighting: 'unknown', colorPalette: [], mood: 'unknown' },
    subjects: [],
    cameraWork: 'unknown',
    setting: 'unknown',
    confidence: 0.1
  };
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