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
    const { fileId, accessToken, frameCount = 3 } = await req.json();
    
    if (!fileId || !accessToken) {
      return new Response(JSON.stringify({ 
        error: 'File ID and access token required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🎬 Extracting frames from video: ${fileId}`);

    // Download the video file in chunks to find frame data
    const videoResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': 'bytes=0-5242880' // First 5MB to find video structure
        }
      }
    );

    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoChunk = await videoResponse.arrayBuffer();
    console.log(`📥 Downloaded video chunk: ${(videoChunk.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Parse video structure and extract frame data
    const frames = await extractFramesFromVideoData(videoChunk, frameCount);
    
    if (frames.length === 0) {
      throw new Error('No frames could be extracted from video data');
    }

    console.log(`🖼️ Successfully extracted ${frames.length} frames from video`);

    return new Response(JSON.stringify({
      success: true,
      frames: frames,
      frameCount: frames.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('💥 Error in frame extraction:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      frames: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function extractFramesFromVideoData(videoData: ArrayBuffer, frameCount: number): Promise<string[]> {
  try {
    const uint8Array = new Uint8Array(videoData);
    const frames: string[] = [];
    
    // Look for JPEG frame markers in the video data (most mobile videos contain JPEG frames)
    const jpegStart = [0xFF, 0xD8]; // JPEG start marker
    const jpegEnd = [0xFF, 0xD9];   // JPEG end marker
    
    let searchPos = 0;
    let frameFound = 0;
    
    while (searchPos < uint8Array.length - 1 && frameFound < frameCount) {
      // Find JPEG start marker
      const startIndex = findByteSequence(uint8Array, jpegStart, searchPos);
      if (startIndex === -1) break;
      
      // Find corresponding end marker
      const endIndex = findByteSequence(uint8Array, jpegEnd, startIndex + 2);
      if (endIndex === -1) break;
      
      // Extract the JPEG frame
      const frameData = uint8Array.slice(startIndex, endIndex + 2);
      
      // Validate it's a proper JPEG (minimum size check)
      if (frameData.length > 1000) { // At least 1KB for a valid frame
        const base64Frame = btoa(String.fromCharCode(...frameData));
        const dataUrl = `data:image/jpeg;base64,${base64Frame}`;
        frames.push(dataUrl);
        frameFound++;
        
        console.log(`📸 Extracted frame ${frameFound}: ${(frameData.length / 1024).toFixed(1)}KB`);
      }
      
      searchPos = endIndex + 2;
    }
    
    // If we didn't find enough JPEG frames, try extracting from different positions
    if (frames.length === 0) {
      console.log('⚠️ No JPEG frames found, attempting alternative extraction...');
      
      // Try to extract frames at different positions in the video data
      const positions = [0.1, 0.3, 0.5, 0.7, 0.9]; // 10%, 30%, 50%, 70%, 90% through the data
      
      for (let i = 0; i < Math.min(positions.length, frameCount); i++) {
        const position = Math.floor(uint8Array.length * positions[i]);
        
        // Look for any recognizable image patterns around this position
        const searchStart = Math.max(0, position - 10000);
        const searchEnd = Math.min(uint8Array.length, position + 10000);
        
        const startIndex = findByteSequence(uint8Array, jpegStart, searchStart);
        if (startIndex !== -1 && startIndex < searchEnd) {
          const endIndex = findByteSequence(uint8Array, jpegEnd, startIndex + 2);
          if (endIndex !== -1) {
            const frameData = uint8Array.slice(startIndex, endIndex + 2);
            if (frameData.length > 1000) {
              const base64Frame = btoa(String.fromCharCode(...frameData));
              const dataUrl = `data:image/jpeg;base64,${base64Frame}`;
              frames.push(dataUrl);
              console.log(`📸 Alternative extraction frame ${i + 1}: ${(frameData.length / 1024).toFixed(1)}KB`);
            }
          }
        }
      }
    }
    
    return frames;
  } catch (error) {
    console.error('Frame extraction from video data failed:', error);
    return [];
  }
}

function findByteSequence(data: Uint8Array, sequence: number[], startPos: number = 0): number {
  for (let i = startPos; i <= data.length - sequence.length; i++) {
    let found = true;
    for (let j = 0; j < sequence.length; j++) {
      if (data[i + j] !== sequence[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}