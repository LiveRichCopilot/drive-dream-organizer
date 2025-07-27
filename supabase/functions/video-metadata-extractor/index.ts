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

    console.log('Starting metadata extraction for file:', fileId)

    // Get file metadata from Google Drive API
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,createdTime,modifiedTime,videoMediaMetadata,imageMediaMetadata,mimeType`,
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
    console.log('File metadata retrieved:', fileData.name, 'Size:', fileData.size)

    // Enhanced metadata extraction for video files
    let originalDate = null
    
    // First, try to extract from filename pattern (iPhone/camera patterns)
    originalDate = extractDateFromFilename(fileData.name)
    
    if (!originalDate && fileData.mimeType?.includes('video')) {
      // Download more of the file for better metadata extraction
      console.log('Attempting to extract metadata from file content...')
      originalDate = await extractVideoMetadata(fileId, accessToken, fileData.name, parseInt(fileData.size || '0'))
    }

    // Build the response
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
        duration: formatDuration(parseInt(fileData.videoMediaMetadata.durationMillis || '0'))
      } : null,

      // Original creation date - the most important field
      originalDate: originalDate,
      
      // Formatted versions
      dateCreated: originalDate ? formatDate(originalDate) : null,
      yearMonth: originalDate ? getYearMonth(originalDate) : null,
      year: originalDate ? getYear(originalDate) : null,
    }

    console.log(`Metadata extraction complete for ${fileData.name}. Original date: ${originalDate || 'NOT FOUND'}`)

    return new Response(
      JSON.stringify(metadata),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in video-metadata-extractor:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function extractDateFromFilename(fileName: string): string | null {
  // iPhone/camera patterns
  const patterns = [
    // IMG_7812.MOV pattern - extract from the number (photos are often sequential by date)
    /IMG_(\d{4,})/,  // This won't give us the date directly
    // More specific date patterns
    /(\d{4})[_-](\d{2})[_-](\d{2})[_\s](\d{2})[_-](\d{2})[_-](\d{2})/,
    /(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/,
    /VID[_-](\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/,
  ]
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern)
    if (match && match.length >= 4) {
      try {
        const year = parseInt(match[1])
        const month = parseInt(match[2])
        const day = parseInt(match[3])
        const hour = match[4] ? parseInt(match[4]) : 0
        const minute = match[5] ? parseInt(match[5]) : 0
        const second = match[6] ? parseInt(match[6]) : 0
        
        if (year >= 2000 && year <= 2024 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const date = new Date(year, month - 1, day, hour, minute, second)
          return date.toISOString()
        }
      } catch (e) {
        console.error('Error parsing date from filename:', e)
      }
    }
  }
  
  return null
}

async function extractVideoMetadata(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    // For MOV files, we need to look deeper into the file
    // Download up to 10MB to ensure we get the metadata atoms
    const downloadSize = Math.min(10 * 1024 * 1024, fileSize)
    
    console.log(`Downloading ${Math.floor(downloadSize / 1024 / 1024)}MB for metadata extraction...`)
    
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': `bytes=0-${downloadSize - 1}`
        }
      }
    )
    
    if (!response.ok) {
      console.error('Failed to download file content:', response.status)
      return null
    }
    
    const arrayBuffer = await response.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    
    console.log(`Downloaded ${data.length} bytes for analysis`)
    
    // Try multiple extraction methods
    let extractedDate = null
    
    // Method 1: Look for QuickTime atoms
    extractedDate = extractQuickTimeMetadata(data)
    if (extractedDate) {
      console.log('Extracted date from QuickTime metadata:', extractedDate)
      return extractedDate
    }
    
    // Method 2: Look for creation_time strings in the file
    extractedDate = findCreationTimeString(data)
    if (extractedDate) {
      console.log('Extracted date from creation_time string:', extractedDate)
      return extractedDate
    }
    
    // Method 3: Look for GPS date stamps (common in iPhone videos)
    extractedDate = findGPSDateStamp(data)
    if (extractedDate) {
      console.log('Extracted date from GPS metadata:', extractedDate)
      return extractedDate
    }
    
    console.log('No metadata found in file content')
    return null
    
  } catch (error) {
    console.error('Error extracting video metadata:', error)
    return null
  }
}

function extractQuickTimeMetadata(data: Uint8Array): string | null {
  try {
    // QuickTime files have a specific structure with atoms
    // Look for 'mvhd' (movie header) atom which contains creation time
    const mvhdSignature = [0x6D, 0x76, 0x68, 0x64] // "mvhd"
    
    for (let i = 0; i < data.length - 32; i++) {
      if (data[i] === mvhdSignature[0] && 
          data[i+1] === mvhdSignature[1] && 
          data[i+2] === mvhdSignature[2] && 
          data[i+3] === mvhdSignature[3]) {
        
        console.log('Found mvhd atom at position:', i)
        
        // The creation time is 4 bytes after the version/flags (which is 4 bytes after mvhd)
        // For version 0, it's a 32-bit value
        // For version 1, it's a 64-bit value
        const version = data[i + 8]
        let creationTime: number
        
        if (version === 0) {
          // 32-bit creation time (version 0)
          creationTime = new DataView(data.buffer, data.byteOffset + i + 12, 4).getUint32(0, false)
        } else if (version === 1) {
          // 64-bit creation time (version 1)
          const high = new DataView(data.buffer, data.byteOffset + i + 16, 4).getUint32(0, false)
          const low = new DataView(data.buffer, data.byteOffset + i + 20, 4).getUint32(0, false)
          creationTime = high * 0x100000000 + low
        } else {
          console.log('Unknown mvhd version:', version)
          continue
        }
        
        // QuickTime epoch starts at January 1, 1904
        // Unix epoch starts at January 1, 1970
        // Difference is 2082844800 seconds
        const unixTime = creationTime - 2082844800
        
        // Validate the timestamp
        if (unixTime > 946684800 && unixTime < 1735689600) { // Between 2000 and 2025
          const date = new Date(unixTime * 1000)
          return date.toISOString()
        }
      }
    }
    
    // Also look for 'creation_time' in metadata atoms
    const creationTimeBytes = Array.from('creation_time').map(c => c.charCodeAt(0))
    for (let i = 0; i < data.length - 100; i++) {
      let match = true
      for (let j = 0; j < creationTimeBytes.length; j++) {
        if (data[i + j] !== creationTimeBytes[j]) {
          match = false
          break
        }
      }
      
      if (match) {
        // Found "creation_time", now look for the date string after it
        const dateStr = extractDateStringAfterPosition(data, i + creationTimeBytes.length)
        if (dateStr) {
          return dateStr
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error in extractQuickTimeMetadata:', error)
    return null
  }
}

function findCreationTimeString(data: Uint8Array): string | null {
  try {
    // Convert portions of binary data to string to search for date patterns
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const chunkSize = 1024
    
    for (let i = 0; i < data.length - chunkSize; i += chunkSize / 2) {
      const chunk = data.slice(i, i + chunkSize)
      const text = decoder.decode(chunk)
      
      // Look for ISO date patterns
      const datePatterns = [
        /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/,
        /(\d{4}:\d{2}:\d{2}\s\d{2}:\d{2}:\d{2})/,
        /creation[_\s]?time["\s:=]+([^"]+)/i,
      ]
      
      for (const pattern of datePatterns) {
        const match = text.match(pattern)
        if (match) {
          const dateStr = match[1] || match[0]
          const parsed = parseFlexibleDate(dateStr)
          if (parsed) {
            return parsed
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error in findCreationTimeString:', error)
    return null
  }
}

function findGPSDateStamp(data: Uint8Array): string | null {
  try {
    // iPhone videos often contain GPS timestamps
    const gpsDateBytes = Array.from('gps').map(c => c.charCodeAt(0))
    
    for (let i = 0; i < data.length - 50; i++) {
      if (data[i] === gpsDateBytes[0] && 
          data[i+1] === gpsDateBytes[1] && 
          data[i+2] === gpsDateBytes[2]) {
        
        // Look for date patterns near GPS tags
        const nearbyData = data.slice(Math.max(0, i - 50), Math.min(data.length, i + 100))
        const decoder = new TextDecoder('utf-8', { fatal: false })
        const text = decoder.decode(nearbyData)
        
        const dateMatch = text.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/)
        if (dateMatch) {
          const year = parseInt(dateMatch[1])
          const month = parseInt(dateMatch[2])
          const day = parseInt(dateMatch[3])
          
          if (year >= 2000 && year <= 2024 && month >= 1 && month <= 12) {
            // Try to find time as well
            const timeMatch = text.match(/(\d{2}):(\d{2}):(\d{2})/)
            if (timeMatch) {
              const date = new Date(year, month - 1, day, 
                parseInt(timeMatch[1]), parseInt(timeMatch[2]), parseInt(timeMatch[3]))
              return date.toISOString()
            } else {
              const date = new Date(year, month - 1, day, 12, 0, 0)
              return date.toISOString()
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error in findGPSDateStamp:', error)
    return null
  }
}

function extractDateStringAfterPosition(data: Uint8Array, position: number): string | null {
  try {
    // Look for date string in the next 50 bytes
    const searchData = data.slice(position, Math.min(position + 50, data.length))
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const text = decoder.decode(searchData)
    
    // Try to find date patterns
    const patterns = [
      /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/,
      /(\d{4}:\d{2}:\d{2}\s\d{2}:\d{2}:\d{2})/,
    ]
    
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        return parseFlexibleDate(match[1])
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting date string:', error)
    return null
  }
}

function parseFlexibleDate(dateStr: string): string | null {
  try {
    // Handle various date formats
    const normalized = dateStr
      .replace(/:/g, '-', 2) // Replace first two colons with dashes
      .replace(/\s/, 'T')    // Replace space with T
      .replace(/Z$/, '')     // Remove trailing Z if present
    
    const date = new Date(normalized)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= 2024) {
      return date.toISOString()
    }
    
    return null
  } catch (error) {
    return null
  }
}

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