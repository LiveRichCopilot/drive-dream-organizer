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

    // Try to extract the real shooting date from video file metadata
    const realShootingDate = await extractRealShootingDate(fileId, accessToken, fileData.name)

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
      
      // For organization purposes - use real shooting date if found
      dateCreated: formatDate(realShootingDate || fileData.createdTime),
      yearMonth: getYearMonth(realShootingDate || fileData.createdTime),
      year: getYear(realShootingDate || fileData.createdTime),
      
      // Original creation date - prioritize extracted date
      originalDate: realShootingDate || fileData.modifiedTime || fileData.createdTime,
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

async function extractRealShootingDate(fileId: string, accessToken: string, fileName: string): Promise<string | null> {
  try {
    console.log(`Attempting to extract real shooting date for ${fileName}`)
    
    // Try filename pattern extraction first (fastest method)
    const filenameDate = extractDateFromFilename(fileName)
    if (filenameDate) {
      console.log(`Found date in filename: ${filenameDate}`)
      return filenameDate
    }
    
    // Download file content to extract metadata
    const fileContent = await downloadVideoMetadata(fileId, accessToken)
    if (!fileContent) {
      console.log('Could not download file content for metadata extraction')
      return null
    }
    
    // Try different metadata extraction methods
    const extractedDate = 
      extractQuickTimeCreationDate(fileContent) ||
      extractMP4CreationDate(fileContent) ||
      extractTextMetadata(fileContent)
    
    if (extractedDate) {
      console.log(`Successfully extracted shooting date: ${extractedDate}`)
      return extractedDate
    }
    
    console.log('No real shooting date found in video metadata')
    return null
  } catch (error) {
    console.error('Error extracting real shooting date:', error)
    return null
  }
}

function extractDateFromFilename(fileName: string): string | null {
  const patterns = [
    // Common camera naming patterns with more variations
    /IMG_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,  // IMG_YYYYMMDD_HHMMSS
    /VID_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,  // VID_YYYYMMDD_HHMMSS
    /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/,  // YYYY-MM-DDTHH-MM-SS
    /(\d{4})-(\d{2})-(\d{2}).*?(\d{2})-(\d{2})-(\d{2})/, // YYYY-MM-DD_HH-MM-SS
    /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,      // YYYYMMDD_HHMMSS
    /(\d{4})-(\d{2})-(\d{2})/,                          // YYYY-MM-DD
    /(\d{4})(\d{2})(\d{2})/,                           // YYYYMMDD
    // iPhone/iOS patterns
    /IMG_(\d{4})\.MOV/,                                 // IMG_NNNN.MOV (iPhone)
    /(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.(\d{2})/, // YYYY-MM-DD HH.MM.SS
  ]
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern)
    if (match) {
      const year = parseInt(match[1])
      const month = parseInt(match[2]) || 1
      const day = parseInt(match[3]) || 1
      
      // More lenient year validation - remove 2025 exclusion
      if (year >= 2000 && year <= new Date().getFullYear() + 1) {
        const hour = match[4] ? parseInt(match[4]) : 12
        const minute = match[5] ? parseInt(match[5]) : 0
        const second = match[6] ? parseInt(match[6]) : 0
        
        const date = new Date(year, month - 1, day, hour, minute, second)
        if (!isNaN(date.getTime()) && date.getFullYear() === year) {
          return date.toISOString()
        }
      }
    }
  }
  
  return null
}

async function downloadVideoMetadata(fileId: string, accessToken: string): Promise<Uint8Array | null> {
  try {
    // Download first 10MB which should contain all metadata
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': 'bytes=0-10485760' // 10MB
        }
      }
    )
    
    if (!response.ok) {
      console.log('Failed to download video content for metadata extraction')
      return null
    }
    
    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  } catch (error) {
    console.error('Error downloading video metadata:', error)
    return null
  }
}

function extractQuickTimeCreationDate(data: Uint8Array): string | null {
  try {
    // Look for multiple QuickTime atoms
    const atoms = [
      [0x6D, 0x76, 0x68, 0x64], // 'mvhd' - movie header
      [0x6D, 0x64, 0x68, 0x64], // 'mdhd' - media header  
      [0x74, 0x6B, 0x68, 0x64], // 'tkhd' - track header
    ]
    
    for (const atom of atoms) {
      const atomIndex = findBytesPattern(data, atom)
      
      if (atomIndex !== -1 && atomIndex + 20 < data.length) {
        // Try different offsets for creation time
        const offsets = [8, 12, 16, 20]
        
        for (const offset of offsets) {
          if (atomIndex + offset + 4 <= data.length) {
            try {
              const qtTime = new DataView(data.buffer, atomIndex + offset, 4).getUint32(0, false)
              
              // Convert from QuickTime epoch (1904) to Unix epoch (1970)
              const unixTime = qtTime - 2082844800
              const date = new Date(unixTime * 1000)
              
              // More realistic date validation
              if (date.getFullYear() >= 2000 && 
                  date.getFullYear() <= new Date().getFullYear() + 1 &&
                  date.getTime() > 0) {
                console.log(`Found QuickTime date: ${date.toISOString()}`)
                return date.toISOString()
              }
            } catch (e) {
              // Continue to next offset
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting QuickTime creation date:', error)
    return null
  }
}

function extractMP4CreationDate(data: Uint8Array): string | null {
  try {
    // Look for MP4 atoms containing creation time
    const patterns = ['creation_time', 'created', 'date']
    
    for (const pattern of patterns) {
      const patternBytes = new TextEncoder().encode(pattern)
      const index = findBytesPattern(data, Array.from(patternBytes))
      
      if (index !== -1) {
        // Search for ISO date format after the pattern
        const searchStart = index + pattern.length
        const searchEnd = Math.min(searchStart + 200, data.length)
        const segment = data.slice(searchStart, searchEnd)
        const text = new TextDecoder('utf-8', { fatal: false }).decode(segment)
        
        const isoMatch = text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/i)
        if (isoMatch) {
          const date = new Date(isoMatch[1])
          if (!isNaN(date.getTime()) && 
              date.getFullYear() >= 2000 && 
              date.getFullYear() <= new Date().getFullYear() + 1) {
            return date.toISOString()
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting MP4 creation date:', error)
    return null
  }
}

function extractTextMetadata(data: Uint8Array): string | null {
  try {
    // Convert to text and search for various timestamp patterns
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data)
    
    const patterns = [
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/gi,
      /creation.*?(\d{4}-\d{2}-\d{2})/gi,
      /timestamp.*?(\d{4}-\d{2}-\d{2})/gi,
    ]
    
    const foundDates: Date[] = []
    
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const dateStr = match[1]
        const date = new Date(dateStr)
        if (!isNaN(date.getTime()) && 
            date.getFullYear() >= 2000 && 
            date.getFullYear() <= new Date().getFullYear() + 1) {
          foundDates.push(date)
        }
      }
    }
    
    if (foundDates.length > 0) {
      const sortedDates = foundDates.sort((a, b) => a.getTime() - b.getTime())
      return sortedDates[0].toISOString()
    }
    
    return null
  } catch (error) {
    console.error('Error extracting text metadata:', error)
    return null
  }
}

function findBytesPattern(data: Uint8Array, pattern: number[]): number {
  for (let i = 0; i <= data.length - pattern.length; i++) {
    let found = true
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) {
        found = false
        break
      }
    }
    if (found) return i
  }
  return -1
}