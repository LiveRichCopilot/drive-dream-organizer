import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchProcessRequest {
  photos: Array<{
    id: string;
    name: string;
    thumbnailLink?: string;
    webViewLink: string;
  }>;
  userEmail: string;
  batchSize?: number;
  startIndex?: number;
  sessionId: string;
}

interface PhotoAnalysis {
  categories: string[];
  colors: string[];
  faces: number;
  landmarks: string[];
  objects: string[];
  scene: string;
  confidence: number;
  prompt?: string; // AI generation prompt extracted from analysis
}

async function analyzePhoto(photo: any, apiKey: string): Promise<PhotoAnalysis> {
  console.log('Downloading photo for analysis:', photo.name);
  
  try {
    // Download the actual file for high-quality analysis
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media`;
    
    // Note: In edge functions, we'd need the access token passed from the client
    // For now, we'll use a placeholder - this should be passed in the request
    const accessToken = photo.accessToken; // This should be provided by the client
    
    if (!accessToken) {
      throw new Error('Access token required for downloading photos');
    }
    
    const downloadResponse = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download photo: ${downloadResponse.status}`);
    }

    // Convert to base64 for OpenAI Vision API
    const imageBlob = await downloadResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    console.log('Photo downloaded, sending to OpenAI for analysis');

    const requestBody = {
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          { 
            type: "text", 
            text: "Analyze this high-resolution image and return a detailed JSON object with the following structure: {\"categories\": [\"category1\", \"category2\"], \"colors\": [\"color1\", \"color2\"], \"faces\": 0, \"landmarks\": [], \"objects\": [\"object1\", \"object2\"], \"scene\": \"indoor/outdoor/people/food/event/travel/general\", \"confidence\": 0.85, \"prompt\": \"detailed description for AI art generation\"}. For clothing photos, focus on style details like 'Black Outfits', 'Swimwear/Bikini', 'Casual/Street'. Provide 2-5 specific categories, 1-3 dominant colors, count of faces, any landmarks, 2-5 main objects, scene type, confidence score, and a detailed prompt suitable for AI image generation that captures the essence, style, and details of this image." 
          },
          { 
            type: "image_url", 
            image_url: { 
              url: `data:${imageBlob.type};base64,${base64Image}`,
              detail: "high" // Request high detail analysis
            } 
          }
        ]
      }],
      max_tokens: 800 // Increased for detailed analysis
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
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const analysisText = data.choices[0].message.content;
  
    try {
      const analysis = JSON.parse(analysisText);
      console.log('Analysis complete:', analysis);
      return analysis;
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', analysisText);
      return {
        categories: ['unanalyzed'],
        colors: ['unknown'],
        faces: 0,
        landmarks: [],
        objects: ['unknown'],
        scene: 'general',
        confidence: 0.5,
        prompt: 'Unable to generate prompt for this image'
      };
    }
  } catch (error) {
    console.error('Photo analysis error:', error);
    throw error;
  }
}

async function processBatch(photos: any[], startIndex: number, batchSize: number, apiKey: string) {
  const batch = photos.slice(startIndex, startIndex + batchSize);
  const results = [];
  
  for (const photo of batch) {
    try {
      const analysis = await analyzePhoto(photo, apiKey);
      results.push({
        id: photo.id,
        name: photo.name,
        analysis,
        success: true
      });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error analyzing ${photo.name}:`, error);
      results.push({
        id: photo.id,
        name: photo.name,
        error: error.message,
        success: false
      });
    }
  }
  
  return results;
}

async function sendBatchCompletionEmail(userEmail: string, batchResults: any[], batchNumber: number, totalBatches: number, categories: string[]) {
  const successCount = batchResults.filter(r => r.success).length;
  const failCount = batchResults.filter(r => !r.success).length;
  
  const categoryList = categories.slice(0, 10).map(cat => `• ${cat}`).join('\n');
  const moreCategories = categories.length > 10 ? `\n...and ${categories.length - 10} more categories` : '';
  
  const html = `
    <h1>🎉 Batch ${batchNumber}/${totalBatches} Complete!</h1>
    
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2>📊 Batch Results</h2>
      <p><strong>✅ Successfully analyzed:</strong> ${successCount} photos</p>
      <p><strong>❌ Failed:</strong> ${failCount} photos</p>
      <p><strong>📁 Total progress:</strong> ${batchNumber * 100} photos processed</p>
    </div>
    
    <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2>🎨 Categories Discovered</h2>
      <pre style="font-family: Arial, sans-serif; line-height: 1.6;">
${categoryList}${moreCategories}
      </pre>
    </div>
    
    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2>⚡ Auto-Processing Status</h2>
      <p>${batchNumber < totalBatches ? 
        `🔄 <strong>Next batch starting automatically...</strong><br>
         Processing will continue in the background even if you close the app!` :
        `🎊 <strong>All batches complete!</strong><br>
         Your entire photo collection has been analyzed and organized.`
      }</p>
    </div>
    
    <p style="margin-top: 30px;">
      <a href="${Deno.env.get('SUPABASE_URL')}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
        View Results in App
      </a>
    </p>
  `;

  await resend.emails.send({
    from: 'Photo AI <noreply@resend.dev>',
    to: [userEmail],
    subject: `📸 Batch ${batchNumber}/${totalBatches} Analysis Complete - ${successCount} photos categorized!`,
    html
  });
}

async function backgroundBatchProcessor(photos: any[], userEmail: string, sessionId: string, batchSize: number, startIndex: number) {
  console.log(`Starting background processing from index ${startIndex}`);
  
  const totalBatches = Math.ceil((photos.length - startIndex) / batchSize);
  let currentBatch = Math.floor(startIndex / batchSize) + 1;
  let allCategories = new Set<string>();
  
  for (let i = startIndex; i < photos.length; i += batchSize) {
    try {
      console.log(`Processing batch ${currentBatch}/${Math.ceil(photos.length / batchSize)} - photos ${i} to ${Math.min(i + batchSize - 1, photos.length - 1)}`);
      
      const batchResults = await processBatch(photos, i, batchSize, openAIApiKey!);
      
      // Collect categories
      batchResults.forEach(result => {
        if (result.success && result.analysis?.categories) {
          result.analysis.categories.forEach((cat: string) => allCategories.add(cat));
        }
      });
      
      // Send email notification
      await sendBatchCompletionEmail(
        userEmail, 
        batchResults, 
        currentBatch, 
        Math.ceil(photos.length / batchSize),
        Array.from(allCategories)
      );
      
      console.log(`Batch ${currentBatch} completed and email sent`);
      currentBatch++;
      
      // Delay between batches to be respectful to APIs
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`Error in batch ${currentBatch}:`, error);
      
      // Send error notification
      await resend.emails.send({
        from: 'Photo AI <noreply@resend.dev>',
        to: [userEmail],
        subject: `❌ Batch ${currentBatch} Processing Error`,
        html: `
          <h1>⚠️ Processing Error</h1>
          <p>Batch ${currentBatch} encountered an error: ${error.message}</p>
          <p>Processing will continue with the next batch automatically.</p>
        `
      });
    }
  }
  
  // Final completion email
  await resend.emails.send({
    from: 'Photo AI <noreply@resend.dev>',
    to: [userEmail],
    subject: '🎊 Complete! All Photos Analyzed & Organized',
    html: `
      <h1>🎉 Mission Accomplished!</h1>
      <p>All ${photos.length} photos have been analyzed and organized into ${allCategories.size} categories.</p>
      <p>Your photo collection is now fully categorized and ready to explore!</p>
      <a href="${Deno.env.get('SUPABASE_URL')}" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
        Explore Your Organized Photos
      </a>
    `
  });
  
  console.log(`Background processing completed for session ${sessionId}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { photos, userEmail, batchSize = 100, startIndex = 0, sessionId }: BatchProcessRequest = await req.json();

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    if (!photos || photos.length === 0) {
      throw new Error('No photos provided for processing');
    }

    console.log(`Starting batch processing: ${photos.length} photos, batch size: ${batchSize}, starting at: ${startIndex}`);

    // Process first batch immediately for instant feedback
    const firstBatchResults = await processBatch(photos, startIndex, Math.min(batchSize, photos.length - startIndex), openAIApiKey);
    
    // Start background processing for remaining batches
    if (startIndex + batchSize < photos.length) {
      EdgeRuntime.waitUntil(
        backgroundBatchProcessor(photos, userEmail, sessionId, batchSize, startIndex + batchSize)
      );
    }

    // Send immediate response with first batch results
    return new Response(JSON.stringify({
      success: true,
      firstBatchResults,
      totalPhotos: photos.length,
      batchSize,
      backgroundProcessingStarted: startIndex + batchSize < photos.length,
      estimatedBatches: Math.ceil(photos.length / batchSize),
      message: 'First batch completed instantly, remaining batches processing in background'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in batch-photo-processor:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});