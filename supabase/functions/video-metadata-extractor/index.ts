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
    
    // Try different metadata extraction methods in order of reliability
    const extractedDate = 
      extractQuickTimeCreationDate(fileContent) ||
      extractMP4CreationDate(fileContent) ||
      extractExifData(fileContent) ||
      extractXMPMetadata(fileContent) ||
      extractAVIMetadata(fileContent) ||
      extractCanonMetadata(fileContent) ||
      extractSonyMetadata(fileContent) ||
      extractiPhoneMetadata(fileContent) ||
      extractAndroidMetadata(fileContent) ||
      extractProResMetadata(fileContent) ||
      extractH264H265Metadata(fileContent) ||
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
    console.log('Starting QuickTime metadata extraction...')
    
    // Look for multiple QuickTime atoms - enhanced search
    const atoms = [
      { name: 'mvhd', bytes: [0x6D, 0x76, 0x68, 0x64], offsets: [8, 12, 16, 20, 24] }, // movie header
      { name: 'mdhd', bytes: [0x6D, 0x64, 0x68, 0x64], offsets: [12, 16, 20, 24, 28] }, // media header  
      { name: 'tkhd', bytes: [0x74, 0x6B, 0x68, 0x64], offsets: [8, 12, 16, 20, 24] }, // track header
      { name: 'udta', bytes: [0x75, 0x64, 0x74, 0x61], offsets: [8, 12, 16, 20] }, // user data
      { name: 'uuid', bytes: [0x75, 0x75, 0x69, 0x64], offsets: [16, 20, 24, 28] }, // UUID boxes
    ]
    
    for (const atom of atoms) {
      const atomIndex = findBytesPattern(data, atom.bytes)
      
      if (atomIndex !== -1 && atomIndex + 32 < data.length) {
        console.log(`Found ${atom.name} atom at index ${atomIndex}`)
        
        // Try different offsets for creation time
        for (const offset of atom.offsets) {
          if (atomIndex + offset + 8 <= data.length) {
            try {
              // Try both 32-bit and 64-bit timestamps
              const qtTime32 = new DataView(data.buffer, atomIndex + offset, 4).getUint32(0, false)
              const qtTime64 = new DataView(data.buffer, atomIndex + offset, 8).getBigUint64(0, false)
              
              // Convert from QuickTime epoch (1904) to Unix epoch (1970)
              const timestamps = [
                qtTime32 - 2082844800,
                Number(qtTime64 - 2082844800n),
                qtTime32 - 2082844800 - (7 * 24 * 60 * 60), // Try timezone adjustments
                qtTime32 - 2082844800 + (7 * 24 * 60 * 60)
              ]
              
              for (const unixTime of timestamps) {
                if (unixTime > 0 && unixTime < 4102444800) { // Valid range: 1970-2100
                  const date = new Date(unixTime * 1000)
                  
                  if (date.getFullYear() >= 2000 && 
                      date.getFullYear() <= new Date().getFullYear() + 1 &&
                      date.getTime() > 0) {
                    console.log(`Found QuickTime date from ${atom.name}: ${date.toISOString()}`)
                    return date.toISOString()
                  }
                }
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

// Additional metadata extraction functions

function extractExifData(data: Uint8Array): string | null {
  try {
    // Look for EXIF data in video files (some cameras embed this)
    const exifMarker = [0xFF, 0xE1] // EXIF marker
    const exifIndex = findBytesPattern(data, exifMarker)
    
    if (exifIndex !== -1) {
      // Look for DateTime tag (0x0132) in EXIF data
      const dateTimeTag = [0x01, 0x32]
      const tagIndex = findBytesPattern(data.slice(exifIndex, exifIndex + 2000), dateTimeTag)
      
      if (tagIndex !== -1) {
        const segment = data.slice(exifIndex + tagIndex + 8, exifIndex + tagIndex + 28)
        const text = new TextDecoder('utf-8', { fatal: false }).decode(segment)
        
        // EXIF DateTime format: "YYYY:MM:DD HH:MM:SS"
        const match = text.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
        if (match) {
          const [, year, month, day, hour, minute, second] = match
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 
                               parseInt(hour), parseInt(minute), parseInt(second))
          
          if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && 
              date.getFullYear() <= new Date().getFullYear() + 1) {
            console.log(`Found EXIF date: ${date.toISOString()}`)
            return date.toISOString()
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting EXIF data:', error)
    return null
  }
}

function extractXMPMetadata(data: Uint8Array): string | null {
  try {
    // Look for XMP metadata which can contain creation dates
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data)
    
    const xmpPatterns = [
      /xmp:CreateDate="([^"]+)"/i,
      /xmp:ModifyDate="([^"]+)"/i,
      /photoshop:DateCreated="([^"]+)"/i,
      /CreateDate="([^"]+)"/i,
      /<CreateDate>([^<]+)<\/CreateDate>/i,
      /<DateTimeOriginal>([^<]+)<\/DateTimeOriginal>/i,
    ]
    
    for (const pattern of xmpPatterns) {
      const match = text.match(pattern)
      if (match) {
        const dateStr = match[1]
        const date = new Date(dateStr)
        
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && 
            date.getFullYear() <= new Date().getFullYear() + 1) {
          console.log(`Found XMP date: ${date.toISOString()}`)
          return date.toISOString()
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting XMP metadata:', error)
    return null
  }
}

function extractAVIMetadata(data: Uint8Array): string | null {
  try {
    // Look for AVI header and stream info
    const aviHeader = [0x52, 0x49, 0x46, 0x46] // "RIFF"
    const aviIndex = findBytesPattern(data, aviHeader)
    
    if (aviIndex !== -1) {
      // Look for IDIT (creation date) chunk in AVI
      const iditChunk = [0x49, 0x44, 0x49, 0x54] // "IDIT"
      const iditIndex = findBytesPattern(data.slice(aviIndex, aviIndex + 5000), iditChunk)
      
      if (iditIndex !== -1) {
        const segment = data.slice(aviIndex + iditIndex + 8, aviIndex + iditIndex + 50)
        const text = new TextDecoder('utf-8', { fatal: false }).decode(segment)
        
        // AVI date format can vary
        const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})|(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})/)
        if (dateMatch) {
          const date = new Date(dateMatch[0])
          if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && 
              date.getFullYear() <= new Date().getFullYear() + 1) {
            console.log(`Found AVI date: ${date.toISOString()}`)
            return date.toISOString()
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting AVI metadata:', error)
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

// Camera-specific metadata extraction functions

function extractCanonMetadata(data: Uint8Array): string | null {
  try {
    console.log('Searching for Canon-specific metadata...')
    
    // Look for Canon CNTH (Canon Thumbnail) or CNDA (Canon Data) atoms
    const canonAtoms = [
      [0x43, 0x4E, 0x54, 0x48], // "CNTH"
      [0x43, 0x4E, 0x44, 0x41], // "CNDA"
      [0x43, 0x61, 0x6E, 0x6F], // "Cano" - Canon maker note
    ]
    
    for (const atom of canonAtoms) {
      const atomIndex = findBytesPattern(data, atom)
      if (atomIndex !== -1 && atomIndex + 50 < data.length) {
        // Canon stores timestamps in various formats
        const segment = data.slice(atomIndex, atomIndex + 200)
        const text = new TextDecoder('utf-8', { fatal: false }).decode(segment)
        
        // Look for Canon timestamp patterns
        const patterns = [
          /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
          /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
        ]
        
        for (const pattern of patterns) {
          const match = text.match(pattern)
          if (match) {
            const [, year, month, day, hour, minute, second] = match
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 
                                 parseInt(hour), parseInt(minute), parseInt(second))
            
            if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && 
                date.getFullYear() <= new Date().getFullYear() + 1) {
              console.log(`Found Canon date: ${date.toISOString()}`)
              return date.toISOString()
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting Canon metadata:', error)
    return null
  }
}

function extractSonyMetadata(data: Uint8Array): string | null {
  try {
    console.log('Searching for Sony-specific metadata...')
    
    // Look for Sony-specific atoms and XAVC metadata
    const sonyPatterns = [
      'Sony', 'XAVC', 'AVCHD', 'rtmd', // Sony format identifiers
    ]
    
    for (const pattern of sonyPatterns) {
      const patternBytes = new TextEncoder().encode(pattern)
      const index = findBytesPattern(data, Array.from(patternBytes))
      
      if (index !== -1) {
        // Search around Sony markers for timestamps
        const searchStart = Math.max(0, index - 100)
        const searchEnd = Math.min(data.length, index + 500)
        const segment = data.slice(searchStart, searchEnd)
        const text = new TextDecoder('utf-8', { fatal: false }).decode(segment)
        
        // Sony timestamp patterns
        const timestampPatterns = [
          /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
          /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
        ]
        
        for (const tsPattern of timestampPatterns) {
          const match = text.match(tsPattern)
          if (match) {
            const date = new Date(match[0])
            if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && 
                date.getFullYear() <= new Date().getFullYear() + 1) {
              console.log(`Found Sony date: ${date.toISOString()}`)
              return date.toISOString()
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting Sony metadata:', error)
    return null
  }
}

function extractiPhoneMetadata(data: Uint8Array): string | null {
  try {
    console.log('Searching for iPhone-specific metadata...')
    
    // Look for Apple-specific metadata atoms
    const appleAtoms = [
      [0x6D, 0x65, 0x74, 0x61], // "meta" - iTunes metadata
      [0x68, 0x76, 0x63, 0x43], // "hvcC" - HEVC configuration
      [0x68, 0x76, 0x63, 0x31], // "hvc1" - HEVC sample entry
    ]
    
    for (const atom of appleAtoms) {
      const atomIndex = findBytesPattern(data, atom)
      if (atomIndex !== -1) {
        // Look for Apple's creation date format
        const searchArea = data.slice(atomIndex, Math.min(atomIndex + 1000, data.length))
        const text = new TextDecoder('utf-8', { fatal: false }).decode(searchArea)
        
        // Apple stores dates in various formats in metadata
        const applePatterns = [
          /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\+\-]\d{2}:\d{2})/,
          /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/,
        ]
        
        for (const pattern of applePatterns) {
          const match = text.match(pattern)
          if (match) {
            const date = new Date(match[1])
            if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && 
                date.getFullYear() <= new Date().getFullYear() + 1) {
              console.log(`Found iPhone date: ${date.toISOString()}`)
              return date.toISOString()
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting iPhone metadata:', error)
    return null
  }
}

function extractAndroidMetadata(data: Uint8Array): string | null {
  try {
    console.log('Searching for Android-specific metadata...')
    
    // Look for Android camera app signatures
    const androidSignatures = ['android', 'camera2', 'CameraMetadata']
    
    for (const signature of androidSignatures) {
      const sigBytes = new TextEncoder().encode(signature)
      const index = findBytesPattern(data, Array.from(sigBytes))
      
      if (index !== -1) {
        // Android cameras often store timestamps near their signatures
        const searchArea = data.slice(Math.max(0, index - 200), Math.min(data.length, index + 500))
        const text = new TextDecoder('utf-8', { fatal: false }).decode(searchArea)
        
        // Common Android timestamp formats
        const androidPatterns = [
          /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/,
          /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/,
          /(\d{10})/  // Unix timestamp
        ]
        
        for (const pattern of androidPatterns) {
          const match = text.match(pattern)
          if (match) {
            let date: Date
            if (match[1].length === 10 && /^\d{10}$/.test(match[1])) {
              // Unix timestamp
              date = new Date(parseInt(match[1]) * 1000)
            } else {
              date = new Date(match[1])
            }
            
            if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && 
                date.getFullYear() <= new Date().getFullYear() + 1) {
              console.log(`Found Android date: ${date.toISOString()}`)
              return date.toISOString()
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting Android metadata:', error)
    return null
  }
}

function extractProResMetadata(data: Uint8Array): string | null {
  try {
    console.log('Searching for ProRes metadata...')
    
    // Look for ProRes-specific atoms
    const proresAtoms = [
      [0x61, 0x70, 0x63, 0x6E], // "apcn" - ProRes 422 Standard
      [0x61, 0x70, 0x63, 0x68], // "apch" - ProRes 422 HQ
      [0x61, 0x70, 0x63, 0x6F], // "apco" - ProRes 422 Proxy
      [0x61, 0x70, 0x34, 0x68], // "ap4h" - ProRes 4444
    ]
    
    for (const atom of proresAtoms) {
      const atomIndex = findBytesPattern(data, atom)
      if (atomIndex !== -1) {
        // ProRes files often have creation time near the codec identifier
        const searchArea = data.slice(Math.max(0, atomIndex - 500), Math.min(data.length, atomIndex + 500))
        
        // Try to find QuickTime timestamps around ProRes atoms
        for (let i = 0; i < searchArea.length - 8; i += 4) {
          try {
            const qtTime = new DataView(searchArea.buffer, searchArea.byteOffset + i, 4).getUint32(0, false)
            const unixTime = qtTime - 2082844800
            
            if (unixTime > 946684800 && unixTime < 4102444800) { // Valid range: 2000-2100
              const date = new Date(unixTime * 1000)
              if (date.getFullYear() >= 2000 && date.getFullYear() <= new Date().getFullYear() + 1) {
                console.log(`Found ProRes date: ${date.toISOString()}`)
                return date.toISOString()
              }
            }
          } catch (e) {
            // Continue searching
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting ProRes metadata:', error)
    return null
  }
}

function extractH264H265Metadata(data: Uint8Array): string | null {
  try {
    console.log('Searching for H.264/H.265 metadata...')
    
    // Look for H.264/H.265 codec identifiers and associated metadata
    const codecAtoms = [
      [0x61, 0x76, 0x63, 0x31], // "avc1" - H.264
      [0x68, 0x76, 0x63, 0x31], // "hvc1" - H.265/HEVC
      [0x68, 0x65, 0x76, 0x31], // "hev1" - H.265/HEVC
    ]
    
    for (const atom of codecAtoms) {
      const atomIndex = findBytesPattern(data, atom)
      if (atomIndex !== -1) {
        // Search for SEI (Supplemental Enhancement Information) which might contain timestamps
        const seiMarker = [0x00, 0x00, 0x00, 0x01, 0x06] // SEI NAL unit
        const seiIndex = findBytesPattern(data.slice(atomIndex, atomIndex + 2000), seiMarker)
        
        if (seiIndex !== -1) {
          const seiData = data.slice(atomIndex + seiIndex, atomIndex + seiIndex + 200)
          const text = new TextDecoder('utf-8', { fatal: false }).decode(seiData)
          
          // Look for timestamps in SEI data
          const seiPatterns = [
            /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/,
            /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/,
          ]
          
          for (const pattern of seiPatterns) {
            const match = text.match(pattern)
            if (match) {
              const date = new Date(match[1])
              if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && 
                  date.getFullYear() <= new Date().getFullYear() + 1) {
                console.log(`Found H.264/H.265 date: ${date.toISOString()}`)
                return date.toISOString()
              }
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting H.264/H.265 metadata:', error)
    return null
  }