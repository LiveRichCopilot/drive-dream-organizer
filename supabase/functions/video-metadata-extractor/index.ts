import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Check if ExifTool is available
async function ensureExifTool(): Promise<boolean> {
  try {
    const process = new Deno.Command("exiftool", {
      args: ["-ver"],
      stdout: "piped",
      stderr: "piped"
    })
    
    const { code } = await process.output()
    if (code === 0) {
      console.log("✅ ExifTool is available")
      return true
    }
  } catch (error) {
    console.log("❌ ExifTool not found:", error)
  }

  console.log("❌ ExifTool is not available")
  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check ExifTool availability
    const exifToolAvailable = await ensureExifTool()
    if (!exifToolAvailable) {
      console.warn("⚠️ ExifTool not available, using fallback metadata extraction")
    }

    const authHeader = req.headers.get('authorization')
    const accessToken = authHeader?.replace('Bearer ', '')
    
    console.log('Auth header received:', authHeader ? 'Present' : 'Missing')
    console.log('Access token length:', accessToken?.length || 0)
    
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
    const startTime = Date.now()

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
    const realShootingDate = await extractRealShootingDate(fileId, accessToken, fileData.name, parseInt(fileData.size || '0'), exifToolAvailable)

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
      
      // For organization purposes - ONLY use real shooting date from original footage
      dateCreated: realShootingDate ? formatDate(realShootingDate) : null,
      yearMonth: realShootingDate ? getYearMonth(realShootingDate) : null,
      year: realShootingDate ? getYear(realShootingDate) : null,
      
      // Original creation date - ONLY from extracted metadata, never fallback to upload dates
      originalDate: realShootingDate,
    }

    const endTime = Date.now()
    console.log(`Metadata extraction completed in ${endTime - startTime}ms for ${fileData.name}`)
    console.log(`Final date used: ${metadata.originalDate} (extracted: ${realShootingDate ? 'YES' : 'NO'})`)
    console.log(`ExifTool available: ${exifToolAvailable ? 'YES' : 'NO'}`)

    return new Response(
      JSON.stringify(metadata),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ CRITICAL ERROR in video-metadata-extractor function:', error)
    console.error('Error stack:', error.stack)
    
    return new Response(
      JSON.stringify({ 
        error: `Function error: ${error.message}`,
        details: error.stack 
      }),
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

async function extractRealShootingDate(fileId: string, accessToken: string, fileName: string, fileSize: number, exifToolAvailable: boolean = false): Promise<string | null> {
  try {
    console.log(`=== METADATA EXTRACTION START for ${fileName} ===`)
    console.log(`File size: ${Math.floor(fileSize / 1024 / 1024)}MB, Format: ${getVideoFormat(fileName)}`)
    
    // Try filename pattern extraction first (fastest method)
    console.log('Step 1: Checking filename for date patterns...')
    const filenameDate = extractDateFromFilename(fileName)
    if (filenameDate) {
      console.log(`✓ SUCCESS: Found date in filename: ${filenameDate}`)
      return filenameDate
    }
    console.log('✗ No date found in filename, proceeding to metadata extraction...')
    
    // Try ExifTool first if available
    if (exifToolAvailable) {
      console.log('Step 2: Downloading file for ExifTool analysis...')
      const tempFilePath = await downloadFileForExifTool(fileId, accessToken, fileName, fileSize)
      if (tempFilePath) {
        console.log('Step 3: Running ExifTool extraction...')
        const exifToolResult = await runExifTool(tempFilePath)
        
        // Clean up temp file
        try {
          await Deno.remove(tempFilePath)
        } catch (error) {
          console.warn('Could not clean up temp file:', error)
        }
        
        if (exifToolResult) {
          console.log(`✓ SUCCESS via ExifTool: ${exifToolResult}`)
          return validateAndReturnDate(exifToolResult, 'ExifTool')
        }
        
        console.log('✗ ExifTool extraction failed, falling back to binary analysis...')
      }
    } else {
      console.log('Step 2: ExifTool not available, using binary analysis...')
    }
    
    // Fallback to simple binary analysis for critical formats
    const fileContent = await downloadVideoMetadata(fileId, accessToken, fileSize)
    if (fileContent) {
      // Try QuickTime first (most reliable for MOV files)
      const quickTimeDate = extractQuickTimeCreationDate(fileContent)
      if (quickTimeDate) {
        console.log(`✓ SUCCESS via QuickTime fallback: ${quickTimeDate}`)
        return validateAndReturnDate(quickTimeDate, 'QuickTime')
      }
      
      // Try MP4 metadata
      const mp4Date = extractMP4CreationDate(fileContent)
      if (mp4Date) {
        console.log(`✓ SUCCESS via MP4 fallback: ${mp4Date}`)
        return validateAndReturnDate(mp4Date, 'MP4')
      }
    }
    
    console.log('✗ COMPLETE FAILURE: All extraction methods failed')
    return null
  } catch (error) {
    console.error('✗ EXTRACTION ERROR:', error)
    return null
  }
}

function validateAndReturnDate(extractedDate: string, method: string): string | null {
  try {
    // Validate that extracted date is NOT an upload date (reject 2025+ dates)
    const extractedDateObj = new Date(extractedDate)
    if (extractedDateObj.getFullYear() >= 2025) {
      console.log(`✗ REJECTED ${method} date ${extractedDate} - appears to be upload date, not original footage date`)
      return null
    }
    
    // Additional validation for reasonable dates
    if (extractedDateObj.getFullYear() < 2000 || extractedDateObj.getFullYear() > 2024) {
      console.log(`✗ REJECTED ${method} date ${extractedDate} - year ${extractedDateObj.getFullYear()} is outside reasonable range (2000-2024)`)
      return null
    }
    
    console.log(`✓ VALIDATED ${method} date: ${extractedDate}`)
    return extractedDate
  } catch (error) {
    console.log(`✗ INVALID ${method} date format: ${extractedDate}`)
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
    /(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.(\d{2})/, // YYYY-MM-DD HH.MM.SS
  ]
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern)
    if (match) {
      const year = parseInt(match[1])
      const month = parseInt(match[2]) || 1
      const day = parseInt(match[3]) || 1
      
      // Reasonable year validation - allow 2000-2030
      if (year >= 2000 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const hour = match[4] ? parseInt(match[4]) : 12
        const minute = match[5] ? parseInt(match[5]) : 0
        const second = match[6] ? parseInt(match[6]) : 0
        
        const date = new Date(year, month - 1, day, hour, minute, second)
        if (!isNaN(date.getTime()) && date.getFullYear() === year) {
          console.log(`Extracted date from filename ${fileName}: ${date.toISOString()}`)
          return date.toISOString()
        }
      }
    }
  }
  
  return null
}

async function downloadFileForExifTool(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    // For ExifTool, we need the full file unless it's too large
    const maxSize = 50 * 1024 * 1024; // 50MB limit for full file download
    
    if (fileSize > maxSize) {
      console.log(`File too large (${Math.floor(fileSize / 1024 / 1024)}MB), ExifTool may not work with partial downloads`)
      return null
    }
    
    console.log(`📥 Downloading full file (${Math.floor(fileSize / 1024 / 1024)}MB) for ExifTool analysis`)
    
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )
    
    if (!response.ok) {
      console.log(`❌ Failed to download file: ${response.status} ${response.statusText}`)
      return null
    }
    
    // Create temporary file
    const tempFilePath = `/tmp/${fileId}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const fileData = await response.arrayBuffer()
    await Deno.writeFile(tempFilePath, new Uint8Array(fileData))
    
    console.log(`✅ File saved to ${tempFilePath} for ExifTool analysis`)
    return tempFilePath
  } catch (error) {
    console.error('Error downloading file for ExifTool:', error)
    return null
  }
}

async function runExifTool(filePath: string): Promise<string | null> {
  try {
    console.log(`🔧 Running ExifTool on ${filePath}`)
    
    // Run ExifTool to extract creation date metadata
    const process = new Deno.Command("exiftool", {
      args: [
        "-CreateDate",
        "-DateTimeOriginal", 
        "-CreationDate",
        "-MediaCreateDate",
        "-TrackCreateDate",
        "-ModifyDate",
        "-FileModifyDate",
        "-json",
        filePath
      ],
      stdout: "piped",
      stderr: "piped"
    })
    
    const { code, stdout, stderr } = await process.output()
    
    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr)
      console.log(`ExifTool failed with code ${code}: ${errorText}`)
      return null
    }
    
    const output = new TextDecoder().decode(stdout)
    console.log('ExifTool output:', output)
    
    try {
      const data = JSON.parse(output)
      if (Array.isArray(data) && data.length > 0) {
        const metadata = data[0]
        
        // Try different date fields in order of preference
        const dateFields = [
          'DateTimeOriginal',
          'CreateDate', 
          'CreationDate',
          'MediaCreateDate',
          'TrackCreateDate',
          'ModifyDate'
        ]
        
        for (const field of dateFields) {
          if (metadata[field]) {
            const dateStr = metadata[field]
            console.log(`Found ${field}: ${dateStr}`)
            
            // Convert ExifTool date format to ISO
            const isoDate = convertExifDateToISO(dateStr)
            if (isoDate) {
              console.log(`Converted to ISO: ${isoDate}`)
              return isoDate
            }
          }
        }
      }
    } catch (parseError) {
      console.error('Error parsing ExifTool JSON output:', parseError)
    }
    
    return null
  } catch (error) {
    console.error('Error running ExifTool:', error)
    return null
  }
}

function convertExifDateToISO(exifDate: string): string | null {
  try {
    // ExifTool dates can be in various formats:
    // "2023:07:15 14:30:25"
    // "2023-07-15 14:30:25"
    // "2023:07:15T14:30:25"
    
    // Normalize the format
    let normalized = exifDate
      .replace(/:/g, '-', 2) // Replace first two colons with dashes (date part)
      .replace(/(\d{4}-\d{2}-\d{2}) /, '$1T') // Add T between date and time
    
    // Handle timezone if missing
    if (!normalized.includes('+') && !normalized.includes('Z')) {
      normalized += 'Z' // Assume UTC if no timezone
    }
    
    const date = new Date(normalized)
    if (!isNaN(date.getTime())) {
      return date.toISOString()
    }
    
    return null
  } catch (error) {
    console.error('Error converting ExifTool date:', error)
    return null
  }
}

async function downloadVideoMetadata(fileId: string, accessToken: string, fileSize: number): Promise<Uint8Array | null> {
  try {
    // Download first 5MB for metadata extraction
    const downloadSize = Math.min(5 * 1024 * 1024, fileSize)
    
    console.log(`📥 Downloading ${Math.floor(downloadSize / 1024 / 1024)}MB for metadata extraction`)
    
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...(downloadSize < fileSize ? { 'Range': `bytes=0-${downloadSize - 1}` } : {})
        }
      }
    )
    
    if (!response.ok) {
      console.log(`❌ Failed to download video content: ${response.status} ${response.statusText}`)
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
    console.log('🎬 Starting QuickTime/MOV metadata extraction...')
    
    // Look for 'mvhd' (movie header) atom
    const mvhdPattern = [0x6D, 0x76, 0x68, 0x64] // "mvhd"
    const mvhdIndex = findBytesPattern(data, mvhdPattern)
    
    if (mvhdIndex !== -1 && mvhdIndex + 20 <= data.length) {
      console.log(`Found mvhd atom at index ${mvhdIndex}`)
      
      try {
        const version = data[mvhdIndex + 8]
        let creationTime: number
        
        if (version === 0 && mvhdIndex + 16 <= data.length) {
          creationTime = new DataView(data.buffer, data.byteOffset + mvhdIndex + 12, 4).getUint32(0, false)
        } else if (version === 1 && mvhdIndex + 24 <= data.length) {
          const creationTime64 = new DataView(data.buffer, data.byteOffset + mvhdIndex + 16, 8).getBigUint64(0, false)
          creationTime = Number(creationTime64)
        } else {
          console.log('Unsupported mvhd version or insufficient data')
          return null
        }
        
        // Convert Mac epoch (1904) to Unix epoch (1970)
        const unixTime = creationTime - 2082844800
        
        if (unixTime > 946684800 && unixTime < 4102444800) { // Valid range: 2000-2100
          const date = new Date(unixTime * 1000)
          if (!isNaN(date.getTime())) {
            console.log(`Successfully extracted mvhd creation date: ${date.toISOString()}`)
            return date.toISOString()
          }
        }
      } catch (error) {
        console.error('Error parsing mvhd atom:', error)
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
    console.log('🎥 Starting MP4 metadata extraction...')
    
    // Look for 'mvhd' atom in MP4 files
    return extractQuickTimeCreationDate(data) // MP4 uses same structure as QuickTime
  } catch (error) {
    console.error('Error extracting MP4 creation date:', error)
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