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
    const iPhoneDate = extractiPhoneMetadata(fileContent)
    if (iPhoneDate) {
      console.log(`✓ SUCCESS via iPhone: ${iPhoneDate}`)
      return validateAndReturnDate(iPhoneDate, 'iPhone')
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
    // For iPhone videos, we need to download more of the file to get metadata
    // QuickTime metadata can be at the beginning OR end of the file
    const downloadSize = Math.min(
      fileSize < 50 * 1024 * 1024 ? fileSize : 20 * 1024 * 1024, // Download full file if < 50MB, otherwise 20MB
      fileSize
    )
    
    console.log(`📥 Downloading ${Math.floor(downloadSize / 1024 / 1024)}MB of ${Math.floor(fileSize / 1024 / 1024)}MB file for metadata extraction`)
    
    // Download the ORIGINAL file without any transcoding - this is critical!
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          // For smaller files, download the whole thing. For larger files, get beginning + end
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
    
    // Also try to get the end of the file if we didn't download the whole thing
    if (downloadSize < fileSize && fileSize > 10 * 1024 * 1024) {
      console.log(`📥 Also downloading end of file for metadata that might be at the end...`)
      try {
        const endResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Range': `bytes=${fileSize - 5 * 1024 * 1024}-${fileSize - 1}` // Last 5MB
            }
          }
        )
        if (endResponse.ok) {
          const endBuffer = await endResponse.arrayBuffer()
          console.log(`✅ Also got ${endBuffer.byteLength} bytes from end of file`)
          // Combine beginning and end for comprehensive metadata search
          const combined = new Uint8Array(arrayBuffer.byteLength + endBuffer.byteLength)
          combined.set(new Uint8Array(arrayBuffer), 0)
          combined.set(new Uint8Array(endBuffer), arrayBuffer.byteLength)
          return combined
        }
      } catch (error) {
        console.log(`⚠️ Could not get end of file, continuing with beginning only`)
      }
    }
    
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
    console.log('🍎 Starting enhanced iPhone-specific metadata extraction...')
    
    // 1. Look for Apple-specific atoms in user data (udta)
    console.log('🔍 Searching for Apple udta (user data) atoms...')
    const udtaDate = extractAppleUdtaMetadata(data)
    if (udtaDate) {
      console.log(`✅ SUCCESS: Found date in Apple udta: ${udtaDate}`)
      return udtaDate
    }
    
    // 2. Look for Apple's ©day atom (creation day)
    console.log('🔍 Searching for Apple ©day atom...')
    const dayAtom = extractAppleDayAtom(data)
    if (dayAtom) {
      console.log(`✅ SUCCESS: Found date in ©day atom: ${dayAtom}`)
      return dayAtom
    }
    
    // 3. Look for Apple's ©xyz atom (location data with timestamps)
    console.log('🔍 Searching for Apple ©xyz location atom...')
    const xyzAtom = extractAppleXyzAtom(data)
    if (xyzAtom) {
      console.log(`✅ SUCCESS: Found date in ©xyz atom: ${xyzAtom}`)
      return xyzAtom
    }
    
    // 4. Look for iTunes-style metadata container
    console.log('🔍 Searching for iTunes metadata...')
    const itunesDate = extractAppleItunesMetadata(data)
    if (itunesDate) {
      console.log(`✅ SUCCESS: Found date in iTunes metadata: ${itunesDate}`)
      return itunesDate
    }
    
    // 5. Look for embedded EXIF-style data in iPhone videos
    console.log('🔍 Searching for embedded EXIF data...')
    const exifDate = extractEmbeddedExifData(data)
    if (exifDate) {
      console.log(`✅ SUCCESS: Found date in embedded EXIF: ${exifDate}`)
      return exifDate
    }
    
    console.log('❌ No iPhone-specific metadata found')
    return null
  } catch (error) {
    console.error('❌ Error in iPhone metadata extraction:', error)
    return null
  }
}

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
              date.getFullYear() <= 2030) {
            console.log(`Found MP4 date: ${date.toISOString()}`)
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

function extractiPhoneMetadata(data: Uint8Array): string | null {
  try {
    console.log('Searching for iPhone-specific metadata...')
    
    // First, comprehensive search for any Apple/iPhone identifiers in the file
    console.log('  -> Scanning for Apple/iPhone signatures...')
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data)
    
    // Check if this is actually an iPhone video by looking for Apple signatures
    const appleSignatures = ['Apple', 'iPhone', 'iOS', 'CoreMedia', 'AVFoundation', 'com.apple']
    let isAppleDevice = false
    for (const signature of appleSignatures) {
      if (text.includes(signature)) {
        console.log(`  -> Found Apple signature: ${signature}`)
        isAppleDevice = true
        break
      }
    }
    
    // Enhanced search for iPhone creation dates in the entire file content
    console.log('  -> Searching for date patterns in file content...')
    const allDatePatterns = [
      // iPhone common formats with strict year validation
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\+\-]\d{2}:\d{2})/g,  // ISO with timezone
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/g,                    // ISO UTC
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/g,                     // ISO basic
      /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g,                     // Apple CoreMedia
      /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/g,                   // Alternative slash format
      /creation.*?(\d{4}-\d{2}-\d{2})/gi,                           // Around "creation" keyword
      /original.*?(\d{4}-\d{2}-\d{2})/gi,                           // Around "original" keyword
    ]
    
    const foundDates: { date: Date, source: string }[] = []
    
    for (let i = 0; i < allDatePatterns.length; i++) {
      const pattern = allDatePatterns[i]
      let match
      while ((match = pattern.exec(text)) !== null) {
        const dateStr = match[1]
        const date = new Date(dateStr)
        
        // Strict validation for iPhone metadata
        if (!isNaN(date.getTime()) && 
            date.getFullYear() >= 2003 &&  // iPhone released in 2007, but allow some buffer
            date.getFullYear() <= 2024 &&  // Exclude 2025 dates (upload dates)
            date.getTime() < Date.now() &&
            date.getTime() > new Date('2003-01-01').getTime()) { // Reasonable oldest date
          
          foundDates.push({
            date: date,
            source: `Pattern ${i + 1}: ${pattern.source.substring(0, 30)}...`
          })
          console.log(`  -> Found potential date: ${date.toISOString()} via ${pattern.source.substring(0, 20)}...`)
        }
      }
    }
    
    // iPhone videos primarily use QuickTime format - look for creation date in udta atom
    console.log('  -> Searching udta atom...')
    const udtaPattern = [0x75, 0x64, 0x74, 0x61] // "udta" - user data atom
    const udtaIndex = findBytesPattern(data, udtaPattern)
    
    if (udtaIndex !== -1) {
      console.log('  -> Found udta atom, searching for creation date...')
      // Search for creation date in udta atom (up to 4KB after udta for more thorough search)
      const searchArea = data.slice(udtaIndex, Math.min(udtaIndex + 4096, data.length))
      const udtaText = new TextDecoder('utf-8', { fatal: false }).decode(searchArea)
      
      // iPhone stores creation date in multiple possible formats within udta
      const udtaPatterns = [
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\+\-]\d{2}:\d{2})/g,
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/g,
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/g,
        /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g,
      ]
      
      for (const pattern of udtaPatterns) {
        let match
        while ((match = pattern.exec(udtaText)) !== null) {
          const dateStr = match[1]
          const date = new Date(dateStr)
          
          if (!isNaN(date.getTime()) && 
              date.getFullYear() >= 2003 && 
              date.getFullYear() <= 2024 &&
              date.getTime() < Date.now()) {
            foundDates.push({
              date: date,
              source: 'udta atom'
            })
            console.log(`  -> Found udta date: ${date.toISOString()}`)
          }
        }
      }
    }
    
    // Also check for Apple-specific metadata atoms with more patterns
    console.log('  -> Searching Apple metadata atoms...')
    const appleAtoms = [
      [0x6D, 0x65, 0x74, 0x61], // "meta" - iTunes metadata
      [0x40, 0x64, 0x61, 0x79], // "@day" - creation day
      [0x40, 0x58, 0x59, 0x5A], // "@XYZ" - location data (often has timestamp)
      [0x69, 0x6C, 0x73, 0x74], // "ilst" - iTunes metadata list
      [0x00, 0x00, 0x00, 0x15], // Common metadata box size pattern
    ]
    
    for (const atom of appleAtoms) {
      const atomIndex = findBytesPattern(data, atom)
      if (atomIndex !== -1) {
        console.log(`  -> Found Apple atom at index ${atomIndex}`)
        const searchArea = data.slice(atomIndex, Math.min(atomIndex + 1000, data.length))
        const atomText = new TextDecoder('utf-8', { fatal: false }).decode(searchArea)
        
        // Look for any date patterns in Apple metadata
        const patterns = [
          /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/g,
          /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/g,
          /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g,
        ]
        
        for (const pattern of patterns) {
          let match
          while ((match = pattern.exec(atomText)) !== null) {
            const date = new Date(match[1])
            if (!isNaN(date.getTime()) && 
                date.getFullYear() >= 2003 && 
                date.getFullYear() <= 2024 &&
                date.getTime() < Date.now()) {
              foundDates.push({
                date: date,
                source: 'Apple metadata atom'
              })
              console.log(`  -> Found Apple atom date: ${date.toISOString()}`)
            }
          }
        }
      }
    }
    
    // If we found any dates, return the earliest one (most likely to be original shooting date)
    if (foundDates.length > 0) {
      const sortedDates = foundDates.sort((a, b) => a.date.getTime() - b.date.getTime())
      const selectedDate = sortedDates[0]
      console.log(`✓ Selected earliest iPhone date: ${selectedDate.date.toISOString()} from ${selectedDate.source}`)
      console.log(`  -> Total dates found: ${foundDates.length}, range: ${foundDates[0]?.date.getFullYear()} - ${foundDates[foundDates.length-1]?.date.getFullYear()}`)
      return selectedDate.date.toISOString()
    }
    
    console.log('  -> No valid iPhone dates found')
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