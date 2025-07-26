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
    
    console.log('Auth header received:', authHeader ? 'Present' : 'Missing')
    console.log('Access token length:', accessToken?.length || 0)
    console.log('Access token prefix:', accessToken?.substring(0, 20) + '...')
    
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

    // Try to extract the real shooting date from video file metadata (with optimization)
    const realShootingDate = await extractRealShootingDate(fileId, accessToken, fileData.name, parseInt(fileData.size || '0'))

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

    return new Response(
      JSON.stringify(metadata),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ CRITICAL ERROR in video-metadata-extractor function:', error)
    console.error('Error stack:', error.stack)
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    
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

async function extractRealShootingDate(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    console.log(`=== METADATA EXTRACTION START for ${fileName} ===`)
    console.log(`File size: ${Math.floor(fileSize / 1024 / 1024)}MB, Format: ${getVideoFormat(fileName)}`)
    
    // For iPhone/iOS videos (IMG_*.MOV files), try a different approach first
    if (fileName.match(/^IMG_\d+\.MOV$/i)) {
      console.log('🍎 Detected iPhone video file - using iOS-specific extraction')
    }
    
    // Try filename pattern extraction first (fastest method)
    console.log('Step 1: Checking filename for date patterns...')
    const filenameDate = extractDateFromFilename(fileName)
    if (filenameDate) {
      console.log(`✓ SUCCESS: Found date in filename: ${filenameDate}`)
      return filenameDate
    }
    console.log('✗ No date found in filename, proceeding to file content analysis...')
    
    // Download file content to extract metadata
    console.log('Step 2: Downloading file content for metadata extraction...')
    const fileContent = await downloadVideoMetadata(fileId, accessToken, fileSize)
    if (!fileContent) {
      console.log('✗ FAILURE: Could not download file content - this should not happen unless file is corrupted or access is denied')
      return null
    }
    console.log(`✓ Downloaded ${Math.floor(fileContent.length / 1024)}KB for analysis`)
    
    // Try different metadata extraction methods in order of reliability
    console.log('Step 3: Attempting metadata extraction methods...')
    
    console.log('  3a: QuickTime/MOV extraction...')
    const quickTimeDate = extractQuickTimeCreationDate(fileContent)
    if (quickTimeDate) {
      console.log(`✓ SUCCESS via QuickTime: ${quickTimeDate}`)
      return validateAndReturnDate(quickTimeDate, 'QuickTime')
    }
    
    console.log('  3b: MP4 extraction...')
    const mp4Date = extractMP4CreationDate(fileContent)
    if (mp4Date) {
      console.log(`✓ SUCCESS via MP4: ${mp4Date}`)
      return validateAndReturnDate(mp4Date, 'MP4')
    }
    
    console.log('  3c: EXIF data extraction...')
    const exifDate = extractExifData(fileContent)
    if (exifDate) {
      console.log(`✓ SUCCESS via EXIF: ${exifDate}`)
      return validateAndReturnDate(exifDate, 'EXIF')
    }
    
    console.log('  3d: XMP metadata extraction...')
    const xmpDate = extractXMPMetadata(fileContent)
    if (xmpDate) {
      console.log(`✓ SUCCESS via XMP: ${xmpDate}`)
      return validateAndReturnDate(xmpDate, 'XMP')
    }
    
    console.log('  3e: AVI metadata extraction...')
    const aviDate = extractAVIMetadata(fileContent)
    if (aviDate) {
      console.log(`✓ SUCCESS via AVI: ${aviDate}`)
      return validateAndReturnDate(aviDate, 'AVI')
    }
    
    console.log('  3f: Canon-specific extraction...')
    const canonDate = extractCanonMetadata(fileContent)
    if (canonDate) {
      console.log(`✓ SUCCESS via Canon: ${canonDate}`)
      return validateAndReturnDate(canonDate, 'Canon')
    }
    
    console.log('  3g: Sony-specific extraction...')
    const sonyDate = extractSonyMetadata(fileContent)
    if (sonyDate) {
      console.log(`✓ SUCCESS via Sony: ${sonyDate}`)
      return validateAndReturnDate(sonyDate, 'Sony')
    }
    
     console.log('  3h: iPhone-specific extraction...')
    try {
      const iPhoneDate = extractiPhoneMetadata(fileContent)
      if (iPhoneDate) {
        console.log(`✓ SUCCESS via iPhone: ${iPhoneDate}`)
        return validateAndReturnDate(iPhoneDate, 'iPhone')
      }
    } catch (error) {
      console.error('❌ Error in iPhone metadata extraction:', error)
    }
    
    console.log('  3i: Android-specific extraction...')
    const androidDate = extractAndroidMetadata(fileContent)
    if (androidDate) {
      console.log(`✓ SUCCESS via Android: ${androidDate}`)
      return validateAndReturnDate(androidDate, 'Android')
    }
    
    console.log('  3j: ProRes metadata extraction...')
    const proResDate = extractProResMetadata(fileContent)
    if (proResDate) {
      console.log(`✓ SUCCESS via ProRes: ${proResDate}`)
      return validateAndReturnDate(proResDate, 'ProRes')
    }
    
    console.log('  3k: H264/H265 metadata extraction...')
    const h264Date = extractH264H265Metadata(fileContent)
    if (h264Date) {
      console.log(`✓ SUCCESS via H264/H265: ${h264Date}`)
      return validateAndReturnDate(h264Date, 'H264/H265')
    }
    
    console.log('  3l: Text metadata extraction (last resort)...')
    const textDate = extractTextMetadata(fileContent)
    if (textDate) {
      console.log(`✓ SUCCESS via Text: ${textDate}`)
      return validateAndReturnDate(textDate, 'Text')
    }
    
    console.log('✗ COMPLETE FAILURE: All extraction methods failed')
    console.log('This indicates either:')
    console.log('  - File is corrupted or has no embedded metadata')
    console.log('  - Camera/device did not write standard metadata')
    console.log('  - File format is not supported by current extraction methods')
    console.log('  - Metadata is in an unusual location/format not covered by extractors')
    return null
  } catch (error) {
    console.error('✗ EXTRACTION ERROR:', error)
    console.error('This indicates a coding error in the extraction logic')
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
    // iPhone/iOS patterns with date extraction
    /IMG_(\d{4})\.MOV/,                                 // IMG_NNNN.MOV (iPhone)
    /(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.(\d{2})/, // YYYY-MM-DD HH.MM.SS
  ]
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern)
    if (match) {
      // For iPhone naming pattern IMG_NNNN.MOV, skip filename extraction
      if (pattern === patterns[7] && match[1]) {
        // Skip IMG_NNNN pattern as it doesn't contain date info
        continue
      }
      
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

async function downloadVideoMetadata(fileId: string, accessToken: string, fileSize: number): Promise<Uint8Array | null> {
  try {
    // **OPTIMIZED DOWNLOAD STRATEGY** - Be more conservative to avoid timeouts
    const downloadSize = Math.min(
      fileSize < 10 * 1024 * 1024 ? fileSize : 5 * 1024 * 1024, // Full file if < 10MB, otherwise 5MB
      fileSize
    )
    
    console.log(`📥 Downloading ${Math.floor(downloadSize / 1024 / 1024)}MB of ${Math.floor(fileSize / 1024 / 1024)}MB file for metadata extraction`)
    
    // Download the ORIGINAL file without any transcoding
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
    console.log(`✅ Successfully downloaded ${arrayBuffer.byteLength} bytes for metadata extraction`)
    
    return new Uint8Array(arrayBuffer)
  } catch (error) {
    console.error('Error downloading video metadata:', error)
    return null
  }
}

function extractQuickTimeCreationDate(data: Uint8Array): string | null {
  try {
    console.log('Starting QuickTime/MOV metadata extraction...')
    
    // Look for QuickTime file type box first to confirm this is a MOV file
    const ftypIndex = findBytesPattern(data, [0x66, 0x74, 0x79, 0x70]) // "ftyp"
    if (ftypIndex === -1) {
      console.log('No QuickTime ftyp box found')
      return null
    }
    console.log(`Found ftyp box at index ${ftypIndex}`)
    
    // Enhanced search for movie header atom (mvhd) - try multiple approaches
    let mvhdIndex = findBytesPattern(data, [0x6D, 0x76, 0x68, 0x64]) // "mvhd"
    if (mvhdIndex === -1) {
      console.log('Primary mvhd search failed, trying alternative search...')
      
      // Alternative search: look for "moov" container first, then mvhd inside it
      const moovIndex = findBytesPattern(data, [0x6D, 0x6F, 0x6F, 0x76]) // "moov"
      if (moovIndex !== -1) {
        console.log(`Found moov container at index ${moovIndex}`)
        // Search for mvhd within 1KB after moov
        const searchArea = data.slice(moovIndex, Math.min(moovIndex + 1024, data.length))
        const localMvhdIndex = findBytesPattern(searchArea, [0x6D, 0x76, 0x68, 0x64])
        if (localMvhdIndex !== -1) {
          mvhdIndex = moovIndex + localMvhdIndex
          console.log(`Found mvhd in moov container at index ${mvhdIndex}`)
        }
      }
      
      if (mvhdIndex === -1) {
        console.log('No mvhd atom found after exhaustive search')
        return null
      }
    }
    
    console.log(`Found mvhd atom at index ${mvhdIndex}`)
    
    try {
      // mvhd structure: 
      // 4 bytes: atom size
      // 4 bytes: "mvhd" 
      // 1 byte: version
      // 3 bytes: flags
      // 4 bytes: creation time (if version 0) or 8 bytes (if version 1)
      
      if (mvhdIndex + 20 > data.length) {
        console.log('mvhd atom too close to end of data')
        return null
      }
      
      // Check version byte (position 8 after start of mvhd)
      const version = data[mvhdIndex + 8]
      console.log(`mvhd version: ${version}`)
      
      let creationTime: number
      
      if (version === 0) {
        // Version 0: 32-bit creation time at offset 12
        if (mvhdIndex + 16 > data.length) return null
        creationTime = new DataView(data.buffer, data.byteOffset + mvhdIndex + 12, 4).getUint32(0, false)
        console.log(`Found 32-bit creation time: ${creationTime}`)
      } else if (version === 1) {
        // Version 1: 64-bit creation time at offset 16  
        if (mvhdIndex + 24 > data.length) return null
        const creationTime64 = new DataView(data.buffer, data.byteOffset + mvhdIndex + 16, 8).getBigUint64(0, false)
        creationTime = Number(creationTime64)
        console.log(`Found 64-bit creation time: ${creationTime}`)
      } else {
        console.log(`Unsupported mvhd version: ${version}`)
        return null
      }
      
      // Convert from QuickTime epoch (1904-01-01) to Unix epoch (1970-01-01)
      // QuickTime epoch is 2082844800 seconds before Unix epoch
      const unixTime = creationTime - 2082844800
      console.log(`Converted to Unix time: ${unixTime}`)
      
      // Validate timestamp is in reasonable range (2000-2030)
      if (unixTime > 946684800 && unixTime < 4102444800) {
        const date = new Date(unixTime * 1000)
        
        // Additional validation
        if (!isNaN(date.getTime()) && 
            date.getFullYear() >= 2000 && 
            date.getFullYear() <= 2030) {
          console.log(`Successfully extracted QuickTime creation date: ${date.toISOString()}`)
          return date.toISOString()
        } else {
          console.log(`Date validation failed: ${date.toISOString()}, year: ${date.getFullYear()}`)
        }
      } else {
        console.log(`Unix timestamp out of valid range: ${unixTime}`)
      }
      
    } catch (error) {
      console.error('Error parsing mvhd atom:', error)
    }
    
    // Fallback: Look for media header atoms (mdhd) which also contain creation times
    const mdhdPattern = [0x6D, 0x64, 0x68, 0x64] // "mdhd"
    let searchStart = 0
    
    while (searchStart < data.length - 24) {
      const mdhdIndex = findBytesPattern(data.slice(searchStart), mdhdPattern)
      if (mdhdIndex === -1) break
      
      const absoluteIndex = searchStart + mdhdIndex
      console.log(`Found mdhd atom at index ${absoluteIndex}`)
      
      try {
        if (absoluteIndex + 24 <= data.length) {
          const version = data[absoluteIndex + 8]
          let creationTime: number
          
          if (version === 0 && absoluteIndex + 16 <= data.length) {
            creationTime = new DataView(data.buffer, data.byteOffset + absoluteIndex + 12, 4).getUint32(0, false)
          } else if (version === 1 && absoluteIndex + 24 <= data.length) {
            const creationTime64 = new DataView(data.buffer, data.byteOffset + absoluteIndex + 16, 8).getBigUint64(0, false)
            creationTime = Number(creationTime64)
          } else {
            searchStart = absoluteIndex + 4
            continue
          }
          
          const unixTime = creationTime - 2082844800
          
          if (unixTime > 946684800 && unixTime < 4102444800) {
            const date = new Date(unixTime * 1000)
            if (!isNaN(date.getTime()) && 
                date.getFullYear() >= 2000 && 
                date.getFullYear() <= 2030) {
              console.log(`Successfully extracted mdhd creation date: ${date.toISOString()}`)
              return date.toISOString()
            }
          }
        }
      } catch (error) {
        console.error('Error parsing mdhd atom:', error)
      }
      
      searchStart = absoluteIndex + 4
    }
    
    console.log('No valid creation time found in QuickTime atoms')
    return null
    
  } catch (error) {
    console.error('Error extracting QuickTime creation date:', error)
    return null
  }
}

// **ENHANCED APPLE/IPHONE METADATA EXTRACTION** 
// Based on ExifTool patterns for comprehensive iPhone video analysis
function extractiPhoneMetadata(data: Uint8Array): string | null {
  try {
    console.log('🍎 Starting iPhone metadata extraction...')
    console.log(`📊 File size: ${data.length} bytes`)
    
    // First, let's see what atoms/signatures are actually in this file
    const fileHeader = data.slice(0, 100)
    const headerText = new TextDecoder('utf-8', { fatal: false }).decode(fileHeader)
    console.log(`📁 File header preview: ${headerText.replace(/[^\x20-\x7E]/g, '.')}`)
    
    // Look for common QuickTime/MOV signatures to confirm file type
    const signatures = ['ftyp', 'moov', 'mdat', 'udta', 'mvhd']
    const foundSignatures = []
    
    for (const sig of signatures) {
      const sigBytes = new TextEncoder().encode(sig)
      const index = findBytesPattern(data.slice(0, Math.min(5000, data.length)), Array.from(sigBytes))
      if (index !== -1) {
        foundSignatures.push(`${sig}@${index}`)
      }
    }
    console.log(`🔍 Found QuickTime atoms: [${foundSignatures.join(', ')}]`)
    
    // iPhone MOV files typically store creation date in multiple locations:
    // 1. QuickTime creation time (mvhd atom)
    // 2. Apple udta metadata 
    // 3. iTunes-style metadata
    
    console.log('  📱 Searching for iPhone-specific creation date patterns...')
    
    // Method 1: Look for Apple's udta (user data) atom which often contains creation time
    const udtaResult = findAppleUdtaCreationTime(data)
    if (udtaResult) {
      console.log(`✅ SUCCESS: Found iPhone date in udta atom: ${udtaResult}`)
      return udtaResult
    }
    
    // Method 2: Look for ©day atom (Apple's day metadata)
    const dayAtomResult = findAppleDayAtom(data)
    if (dayAtomResult) {
      console.log(`✅ SUCCESS: Found iPhone date in ©day atom: ${dayAtomResult}`)
      return dayAtomResult
    }
    
    // Method 3: Search for embedded timestamps in readable text
    const textResult = findEmbeddedTimestamps(data)
    if (textResult) {
      console.log(`✅ SUCCESS: Found iPhone date in embedded text: ${textResult}`)
      return textResult
    }
    
    console.log('❌ No iPhone creation date found in any location')
    return null
  } catch (error) {
    console.error('❌ Error in iPhone metadata extraction:', error)
    return null
  }
}

function findAppleUdtaCreationTime(data: Uint8Array): string | null {
  console.log('  🔍 Searching for Apple udta atom...')
  
  // Look for "udta" atom signature
  const udtaSignature = [0x75, 0x64, 0x74, 0x61] // "udta"
  const udtaIndex = findBytesPattern(data, udtaSignature)
  
  if (udtaIndex === -1) {
    console.log('  ❌ No udta atom found')
    return null
  }
  
  console.log(`  📍 Found udta atom at position ${udtaIndex}`)
  
  // Search around the udta atom for creation time data
  const searchStart = Math.max(0, udtaIndex - 500)
  const searchEnd = Math.min(data.length, udtaIndex + 2000)
  const searchData = data.slice(searchStart, searchEnd)
  
  // Convert to text to look for readable timestamps
  const text = new TextDecoder('utf-8', { fatal: false }).decode(searchData)
  
  // Look for various iPhone timestamp formats
  const patterns = [
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/,
    /(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})/,
    /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const dateStr = match[1].replace(/:/g, '-').replace(' ', 'T') + 'Z'
      try {
        const date = new Date(dateStr)
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= 2024) {
          return date.toISOString()
        }
      } catch (e) {
        continue
      }
    }
  }
  
  return null
}

function findAppleDayAtom(data: Uint8Array): string | null {
  console.log('  🔍 Searching for Apple ©day atom...')
  
  // Look for "©day" atom (Apple's date metadata)
  const daySignature = [0xA9, 0x64, 0x61, 0x79] // "©day"
  const dayIndex = findBytesPattern(data, daySignature)
  
  if (dayIndex === -1) {
    console.log('  ❌ No ©day atom found')
    return null
  }
  
  console.log(`  📍 Found ©day atom at position ${dayIndex}`)
  
  // Extract the data following the ©day atom
  const dataAfterAtom = data.slice(dayIndex + 4, dayIndex + 50)
  const text = new TextDecoder('utf-8', { fatal: false }).decode(dataAfterAtom)
  
  // Look for date patterns immediately after the atom
  const match = text.match(/(\d{4}-\d{2}-\d{2})/)
  if (match) {
    try {
      const date = new Date(match[1] + 'T12:00:00Z')
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= 2024) {
        return date.toISOString()
      }
    } catch (e) {
      // Continue searching
    }
  }
  
  return null
}

function findEmbeddedTimestamps(data: Uint8Array): string | null {
  console.log('  🔍 Searching for embedded timestamps...')
  
  // Search the first 50KB for any embedded readable timestamps
  const searchData = data.slice(0, Math.min(50 * 1024, data.length))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(searchData)
  
  // Look for various timestamp formats that might be embedded
  const patterns = [
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)/g,
    /(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})/g,
    /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/g
  ]
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)]
    for (const match of matches) {
      try {
        let dateStr = match[1]
        // Normalize the format
        if (dateStr.includes(':') && !dateStr.includes('T')) {
          dateStr = dateStr.replace(/:/g, '-').replace(' ', 'T') + 'Z'
        } else if (dateStr.includes('/')) {
          dateStr = dateStr.replace(/\//g, '-').replace(' ', 'T') + 'Z'
        }
        
        const date = new Date(dateStr)
        if (!isNaN(date.getTime()) && 
            date.getFullYear() >= 2000 && 
            date.getFullYear() <= 2024) {
          console.log(`  📅 Found embedded timestamp: ${dateStr} -> ${date.toISOString()}`)
          return date.toISOString()
        }
      } catch (e) {
        continue
      }
    }
  }
  
  return null
}

/* COMMENTED OUT COMPLEX APPLE FUNCTIONS TO AVOID RUNTIME ERRORS
function extractAppleUdtaMetadata(data: Uint8Array): string | null {
  const udtaPattern = [0x75, 0x64, 0x74, 0x61] // "udta"
  let searchIndex = 0
  
  while (searchIndex < data.length - 1000) {
    const udtaIndex = findBytesPattern(data.slice(searchIndex), udtaPattern)
    if (udtaIndex === -1) break
    
    const actualIndex = searchIndex + udtaIndex
    console.log(`Found udta atom at ${actualIndex}`)
    
    // Extract a reasonable chunk of udta data
    const udtaData = data.slice(actualIndex, Math.min(actualIndex + 2048, data.length))
    
    // Look for various Apple date formats within udta
    const text = new TextDecoder('utf-8', { fatal: false }).decode(udtaData)
    
    // Common iPhone date patterns
    const patterns = [
      /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z?/g, // ISO format
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/g, // Compact ISO
      /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g, // EXIF format
      /(\d{4})\/(\d{2})\/(\d{2})/g // Simple date
    ]
    
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        try {
          let dateStr = match[0]
          
          // Normalize different formats to ISO
          if (dateStr.includes('/')) {
            const [, year, month, day] = match
            dateStr = `${year}-${month}-${day}T12:00:00Z`
          } else if (dateStr.includes(':') && !dateStr.includes('T')) {
            const [, year, month, day, hour, minute, second] = match
            dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
          } else if (!dateStr.includes('T')) {
            const year = match[1], month = match[2], day = match[3]
            const hour = match[4] || '12', minute = match[5] || '00', second = match[6] || '00'
            dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
          }
          
          const date = new Date(dateStr)
          if (!isNaN(date.getTime()) && 
              date.getFullYear() >= 2000 && 
              date.getFullYear() <= 2024) {
            console.log(`📅 Found valid date in udta: ${date.toISOString()}`)
            return date.toISOString()
          }
        } catch (e) {
          continue
        }
      }
    }
    
    searchIndex = actualIndex + 4
  }
  
  return null
}

function extractAppleDayAtom(data: Uint8Array): string | null {
  // Apple's ©day atom signature
  const dayPattern = [0xA9, 0x64, 0x61, 0x79] // "©day"
  const index = findBytesPattern(data, dayPattern)
  if (index === -1) return null
  
  // Extract data following the atom
  const dataStart = index + 8 // Skip atom header
  if (dataStart >= data.length - 20) return null
  
  const atomData = data.slice(dataStart, Math.min(dataStart + 100, data.length))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(atomData)
  
  // Look for date patterns
  const dateMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (dateMatch) {
    const [, year, month, day] = dateMatch
    const date = new Date(`${year}-${month}-${day}T12:00:00Z`)
    if (!isNaN(date.getTime()) && 
        date.getFullYear() >= 2000 && 
        date.getFullYear() <= 2024) {
      return date.toISOString()
    }
  }
  
  return null
}

function extractAppleXyzAtom(data: Uint8Array): string | null {
  // Apple's ©xyz atom (location data)
  const xyzPattern = [0xA9, 0x78, 0x79, 0x7A] // "©xyz"
  const index = findBytesPattern(data, xyzPattern)
  if (index === -1) return null
  
  const dataStart = index + 8
  if (dataStart >= data.length - 50) return null
  
  const atomData = data.slice(dataStart, Math.min(dataStart + 200, data.length))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(atomData)
  
  // Location data sometimes contains timestamps
  const dateMatch = text.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (dateMatch) {
    const date = new Date(dateMatch[0])
    if (!isNaN(date.getTime()) && 
        date.getFullYear() >= 2000 && 
        date.getFullYear() <= 2024) {
      return date.toISOString()
    }
  }
  
  return null
}

function extractAppleItunesMetadata(data: Uint8Array): string | null {
  // Look for iTunes metadata container "meta"
  const metaPattern = [0x6D, 0x65, 0x74, 0x61] // "meta"
  const index = findBytesPattern(data, metaPattern)
  if (index === -1) return null
  
  const metaData = data.slice(index, Math.min(index + 4096, data.length))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(metaData)
  
  // Look for various iTunes date fields
  const patterns = [
    /date[^0-9]*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/gi,
    /created[^0-9]*(\d{4}-\d{2}-\d{2})/gi,
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)/g
  ]
  
  for (const pattern of patterns) {
    const matches = text.match(pattern)
    if (matches) {
      for (const match of matches) {
        const dateMatch = match.match(/(\d{4}-\d{2}-\d{2}T?\d{0,2}:?\d{0,2}:?\d{0,2})/)
        if (dateMatch) {
          try {
            let dateStr = dateMatch[1]
            if (!dateStr.includes('T')) {
              dateStr += 'T12:00:00Z'
            } else if (!dateStr.includes('Z') && dateStr.length === 19) {
              dateStr += 'Z'
            }
            
            const date = new Date(dateStr)
            if (!isNaN(date.getTime()) && 
                date.getFullYear() >= 2000 && 
                date.getFullYear() <= 2024) {
              return date.toISOString()
            }
          } catch (e) {
            continue
          }
        }
      }
    }
  }
  
  return null
}

function extractEmbeddedExifData(data: Uint8Array): string | null {
  // Look for EXIF data embedded in iPhone videos
  const exifPattern = [0x45, 0x78, 0x69, 0x66] // "Exif"
  const index = findBytesPattern(data, exifPattern)
  if (index === -1) return null
  
  // Also look for common EXIF date tags
  const datePatterns = [
    'DateTime',
    'DateTimeOriginal', 
    'DateTimeDigitized',
    'CreateDate'
  ]
  
  for (const pattern of datePatterns) {
    const patternBytes = new TextEncoder().encode(pattern)
    const patternIndex = findBytesPattern(data, Array.from(patternBytes))
    if (patternIndex !== -1) {
      // Look for date after the tag
      const searchStart = patternIndex + pattern.length
      const searchData = data.slice(searchStart, Math.min(searchStart + 100, data.length))
      const text = new TextDecoder('utf-8', { fatal: false }).decode(searchData)
      
      const dateMatch = text.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
      if (dateMatch) {
        const [, year, month, day, hour, minute, second] = dateMatch
        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
        if (!isNaN(date.getTime()) && 
            date.getFullYear() >= 2000 && 
            date.getFullYear() <= 2024) {
          return date.toISOString()
        }
      }
    }
  }
  
  return null
*/

function extractMP4CreationDate(data: Uint8Array): string | null {
  try {
    console.log('Starting MP4 metadata extraction...')
    
    // iPhone MP4 files store creation dates in multiple locations:
    // 1. mvhd atom (movie header) - same as QuickTime
    // 2. Meta atoms with creation_time
    // 3. udta atoms with Apple metadata
    
    // First try the standard mvhd approach (works for iPhone MP4s too)
    const mvhdDate = extractMvhdDate(data)
    if (mvhdDate) {
      console.log(`✓ SUCCESS via MP4 mvhd: ${mvhdDate}`)
      return mvhdDate
    }
    
    // Look for MP4 meta atoms
    const metaDate = extractMP4MetaDate(data)
    if (metaDate) {
      console.log(`✓ SUCCESS via MP4 meta: ${metaDate}`)
      return metaDate
    }
    
    // Search for creation_time strings in the file
    const creationTimePattern = new TextEncoder().encode('creation_time')
    const creationIndex = findBytesPattern(data, Array.from(creationTimePattern))
    
    if (creationIndex !== -1) {
      console.log(`Found creation_time pattern at ${creationIndex}`)
      
      // Look for timestamp after the pattern
      const searchStart = creationIndex + creationTimePattern.length
      const searchEnd = Math.min(searchStart + 100, data.length)
      
      // Try to find a 4-byte or 8-byte timestamp (Unix time + Mac epoch offset)
      for (let i = searchStart; i < searchEnd - 8; i++) {
        try {
          // Try 4-byte timestamp first
          const timestamp32 = new DataView(data.buffer, data.byteOffset + i, 4).getUint32(0, false)
          const unixTime32 = timestamp32 - 2082844800 // Mac epoch to Unix epoch
          
          if (unixTime32 > 946684800 && unixTime32 < 4102444800) { // 2000-2100
            const date = new Date(unixTime32 * 1000)
            if (!isNaN(date.getTime())) {
              console.log(`✓ Found MP4 creation_time (32-bit): ${date.toISOString()}`)
              return date.toISOString()
            }
          }
          
          // Try 8-byte timestamp if 4-byte didn't work
          if (i < searchEnd - 8) {
            const timestamp64 = new DataView(data.buffer, data.byteOffset + i, 8).getBigUint64(0, false)
            const unixTime64 = Number(timestamp64) - 2082844800
            
            if (unixTime64 > 946684800 && unixTime64 < 4102444800) {
              const date = new Date(unixTime64 * 1000)
              if (!isNaN(date.getTime())) {
                console.log(`✓ Found MP4 creation_time (64-bit): ${date.toISOString()}`)
                return date.toISOString()
              }
            }
          }
        } catch (e) {
          // Continue searching
        }
      }
    }
    
    console.log('No MP4 creation date found')
    return null
  } catch (error) {
    console.error('Error extracting MP4 creation date:', error)
    return null
  }
}

// Helper function to extract mvhd date from MP4 files
function extractMvhdDate(data: Uint8Array): string | null {
  try {
    const mvhdIndex = findBytesPattern(data, [0x6D, 0x76, 0x68, 0x64]) // "mvhd"
    if (mvhdIndex === -1) {
      return null
    }
    
    console.log(`Found mvhd atom in MP4 at index ${mvhdIndex}`)
    
    if (mvhdIndex + 20 > data.length) {
      return null
    }
    
    const version = data[mvhdIndex + 8]
    console.log(`mvhd version: ${version}`)
    
    let creationTime: number
    
    if (version === 0 && mvhdIndex + 16 <= data.length) {
      creationTime = new DataView(data.buffer, data.byteOffset + mvhdIndex + 12, 4).getUint32(0, false)
    } else if (version === 1 && mvhdIndex + 24 <= data.length) {
      const creationTime64 = new DataView(data.buffer, data.byteOffset + mvhdIndex + 16, 8).getBigUint64(0, false)
      creationTime = Number(creationTime64)
    } else {
      console.log(`Unsupported mvhd version: ${version}`)
      return null
    }
    
    // Convert from Mac epoch (1904) to Unix epoch (1970)
    const unixTime = creationTime - 2082844800
    
    if (unixTime > 946684800 && unixTime < 4102444800) { // 2000-2100 range
      const date = new Date(unixTime * 1000)
      if (!isNaN(date.getTime()) && 
          date.getFullYear() >= 2000 && 
          date.getFullYear() <= 2030) {
        return date.toISOString()
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting mvhd date:', error)
    return null
  }
}

// Helper function to extract dates from MP4 meta atoms
function extractMP4MetaDate(data: Uint8Array): string | null {
  try {
    // Look for meta atom
    const metaIndex = findBytesPattern(data, [0x6D, 0x65, 0x74, 0x61]) // "meta"
    if (metaIndex === -1) {
      return null
    }
    
    console.log(`Found meta atom at ${metaIndex}`)
    
    // Search for date-related keys within meta atom
    const dateKeys = ['©day', 'date', 'creation_time']
    
    for (const key of dateKeys) {
      const keyBytes = new TextEncoder().encode(key)
      const keyIndex = findBytesPattern(data.slice(metaIndex, Math.min(metaIndex + 1000, data.length)), Array.from(keyBytes))
      
      if (keyIndex !== -1) {
        const absoluteIndex = metaIndex + keyIndex
        console.log(`Found ${key} key at ${absoluteIndex}`)
        
        // Look for date data after the key
        const searchStart = absoluteIndex + key.length
        const searchEnd = Math.min(searchStart + 50, data.length)
        const segment = data.slice(searchStart, searchEnd)
        const text = new TextDecoder('utf-8', { fatal: false }).decode(segment)
        
        // Look for various date formats
        const patterns = [
          /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/,
          /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/,
          /(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})/
        ]
        
        for (const pattern of patterns) {
          const match = text.match(pattern)
          if (match) {
            const dateStr = match[1].replace(/:/g, '-').replace(' ', 'T')
            const date = new Date(dateStr)
            if (!isNaN(date.getTime()) && 
                date.getFullYear() >= 2000 && 
                date.getFullYear() <= 2030) {
              return date.toISOString()
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting MP4 meta date:', error)
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
            date.getFullYear() <= 2030) {
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
              date.getFullYear() <= 2030) {
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
            date.getFullYear() <= 2030) {
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
              date.getFullYear() <= 2030) {
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
                date.getFullYear() <= 2030) {
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
                date.getFullYear() <= 2030) {
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
                date.getFullYear() <= 2030) {
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
              if (date.getFullYear() >= 2000 && date.getFullYear() <= 2030) {
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
                  date.getFullYear() <= 2030) {
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
}