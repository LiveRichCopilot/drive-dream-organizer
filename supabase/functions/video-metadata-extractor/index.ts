import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    const accessToken = authHeader?.replace('Bearer ', '')
    
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Access token required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { fileId } = await req.json()
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: 'File ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Extracting metadata for file:', fileId)

    // Get file metadata from Google Drive API
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,createdTime,modifiedTime,videoMediaMetadata,imageMediaMetadata,parents,mimeType,webViewLink,thumbnailLink`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text()
      console.error('Google Drive API error:', fileResponse.status, errorText)
      return new Response(
        JSON.stringify({ error: `Google Drive API error: ${errorText}` }),
        { status: fileResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const fileData = await fileResponse.json()
    console.log('File metadata retrieved:', fileData)

    // Extract enhanced metadata
    const metadata = {
      id: fileData.id,
      name: fileData.name,
      size: parseInt(fileData.size || '0'),
      mimeType: fileData.mimeType,
      
      // Timestamps
      createdTime: fileData.createdTime,
      modifiedTime: fileData.modifiedTime,
      
      // Video metadata
      videoMetadata: fileData.videoMediaMetadata ? {
        width: fileData.videoMediaMetadata.width,
        height: fileData.videoMediaMetadata.height,
        durationMillis: fileData.videoMediaMetadata.durationMillis,
        resolution: `${fileData.videoMediaMetadata.width}x${fileData.videoMediaMetadata.height}`,
        duration: formatDuration(parseInt(fileData.videoMediaMetadata.durationMillis || '0')),
        aspectRatio: calculateAspectRatio(
          fileData.videoMediaMetadata.width, 
          fileData.videoMediaMetadata.height
        )
      } : null,

      // Image metadata (for video thumbnails)
      imageMetadata: fileData.imageMediaMetadata ? {
        width: fileData.imageMediaMetadata.width,
        height: fileData.imageMediaMetadata.height,
        rotation: fileData.imageMediaMetadata.rotation,
        time: fileData.imageMediaMetadata.time,
        location: fileData.imageMediaMetadata.location
      } : null,

      // Links and paths
      webViewLink: fileData.webViewLink,
      thumbnailLink: fileData.thumbnailLink,
      
      // Additional computed metadata
      format: getVideoFormat(fileData.name),
      sizeFormatted: formatFileSize(parseInt(fileData.size || '0')),
      
      // For organization purposes
      dateCreated: formatDate(fileData.createdTime),
      yearMonth: getYearMonth(fileData.createdTime),
      year: getYear(fileData.createdTime),
      
      // Original creation date attempts
      originalDate: await extractOriginalDate(fileData, accessToken),
    }

    // Try to get EXIF data if available (for videos that preserve it)
    if (fileData.videoMediaMetadata) {
      try {
        const exifData = await getEXIFData(fileId, accessToken)
        if (exifData) {
          metadata.exifData = exifData
          // Override with EXIF creation date if available
          if (exifData.dateTimeOriginal) {
            metadata.originalDate = exifData.dateTimeOriginal
          }
        }
      } catch (error) {
        console.log('Could not extract EXIF data:', error)
      }
    }

    return new Response(
      JSON.stringify(metadata),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in video-metadata-extractor function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Helper functions

function formatDuration(durationMillis: number): string {
  const seconds = Math.floor(durationMillis / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  } else {
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getVideoFormat(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  const formatMap: { [key: string]: string } = {
    'mp4': 'MP4',
    'avi': 'AVI', 
    'mov': 'MOV',
    'mkv': 'MKV',
    'wmv': 'WMV',
    'flv': 'FLV',
    'webm': 'WebM',
    'm4v': 'M4V'
  }
  return formatMap[extension || ''] || extension?.toUpperCase() || 'Unknown'
}

function calculateAspectRatio(width: number, height: number): string {
  if (!width || !height) return 'Unknown'
  
  const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b)
  }
  
  const divisor = gcd(width, height)
  const aspectWidth = width / divisor
  const aspectHeight = height / divisor
  
  // Common aspect ratios
  if (aspectWidth === 16 && aspectHeight === 9) return '16:9'
  if (aspectWidth === 4 && aspectHeight === 3) return '4:3'
  if (aspectWidth === 9 && aspectHeight === 16) return '9:16'
  if (aspectWidth === 21 && aspectHeight === 9) return '21:9'
  if (aspectWidth === 1 && aspectHeight === 1) return '1:1'
  
  return `${aspectWidth}:${aspectHeight}`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function getYearMonth(dateString: string): string {
  const date = new Date(dateString)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getYear(dateString: string): string {
  const date = new Date(dateString)
  return date.getFullYear().toString()
}

async function extractOriginalDate(fileData: any, accessToken: string): Promise<string | null> {
  // Try multiple strategies to get the original creation date
  
  // 1. Use video metadata time if available
  if (fileData.videoMediaMetadata?.durationMillis) {
    // Some videos store creation time in metadata
    // This would need actual video file analysis
  }
  
  // 2. Try to infer from filename patterns
  const filename = fileData.name
  const datePatterns = [
    /(\d{4})-(\d{2})-(\d{2})/,  // YYYY-MM-DD
    /(\d{4})(\d{2})(\d{2})/,    // YYYYMMDD
    /IMG_(\d{4})(\d{2})(\d{2})/, // IMG_YYYYMMDD
    /VID_(\d{4})(\d{2})(\d{2})/, // VID_YYYYMMDD
  ]
  
  for (const pattern of datePatterns) {
    const match = filename.match(pattern)
    if (match) {
      const year = match[1]
      const month = match[2]
      const day = match[3]
      const inferredDate = new Date(`${year}-${month}-${day}`)
      if (!isNaN(inferredDate.getTime())) {
        return inferredDate.toISOString()
      }
    }
  }
  
  // 3. Fall back to Google Drive creation time
  return fileData.createdTime
}

async function getEXIFData(fileId: string, accessToken: string): Promise<any | null> {
  try {
    // This would require downloading and analyzing the video file
    // For now, we'll return null as this requires additional video processing libraries
    // In a real implementation, you might use FFmpeg or similar tools
    
    console.log('EXIF extraction not implemented for videos yet')
    return null
  } catch (error) {
    console.error('EXIF extraction failed:', error)
    return null
  }
}