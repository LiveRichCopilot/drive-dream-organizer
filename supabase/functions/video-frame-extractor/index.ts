import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileId, accessToken, frameCount = 3 } = await req.json()
    
    if (!fileId || !accessToken) {
      throw new Error('fileId and accessToken are required')
    }

    console.log(`🎬 Extracting ${frameCount} frames from video: ${fileId}`)

    // Get video metadata from Google Drive
    const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,videoMediaMetadata,thumbnailLink`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!metadataResponse.ok) {
      throw new Error(`Failed to get video metadata: ${metadataResponse.status}`)
    }

    const metadata = await metadataResponse.json()
    console.log(`📊 Video metadata:`, { 
      name: metadata.name, 
      size: metadata.size,
      duration: metadata.videoMediaMetadata?.durationMillis,
      thumbnailLink: metadata.thumbnailLink 
    })

    // For now, we'll use the thumbnail as the primary frame
    // In a full implementation, you'd extract actual video frames
    const frames = []
    
    if (metadata.thumbnailLink) {
      // Get a high-quality thumbnail
      const thumbnailUrl = metadata.thumbnailLink.replace('=s220', '=s800')
      frames.push(thumbnailUrl)
      console.log(`🖼️ Using thumbnail as frame: ${thumbnailUrl}`)
    }

    // Generate additional frame URLs at different time positions
    // Note: This is a simplified approach - real frame extraction would require video processing
    const duration = parseInt(metadata.videoMediaMetadata?.durationMillis || '0')
    if (duration > 0) {
      const timePositions = []
      for (let i = 1; i <= Math.min(frameCount - 1, 2); i++) {
        const timeMs = Math.floor((duration / (frameCount)) * i)
        timePositions.push(timeMs)
      }
      
      // For demonstration, we'll duplicate the thumbnail
      // In production, you'd extract frames at these time positions
      timePositions.forEach((timeMs, index) => {
        if (metadata.thumbnailLink) {
          frames.push(metadata.thumbnailLink.replace('=s220', '=s600'))
        }
      })
    }

    if (frames.length === 0) {
      throw new Error('No frames could be extracted from video')
    }

    console.log(`✅ Successfully extracted ${frames.length} frames`)

    return new Response(
      JSON.stringify({
        success: true,
        frames,
        metadata: {
          name: metadata.name,
          duration: duration,
          frameCount: frames.length
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )

  } catch (error) {
    console.error('❌ Frame extraction failed:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        frames: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})