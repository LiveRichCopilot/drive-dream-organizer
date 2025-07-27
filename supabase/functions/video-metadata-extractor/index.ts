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
    let inferredFromSequence = false
    
    // First, try to extract from filename pattern (iPhone/camera patterns)
    originalDate = extractDateFromFilename(fileData.name)
    
    if (!originalDate && fileData.mimeType?.includes('video')) {
      // Try metadata extraction from file content
      console.log('Attempting to extract metadata from file content...')
      try {
        originalDate = await extractVideoMetadata(fileId, accessToken, fileData.name, parseInt(fileData.size || '0'))
      } catch (error) {
        console.error('Metadata extraction failed:', error.message)
        // Check if it's a resource limit error
        if (error.message.includes('WORKER_LIMIT') || error.message.includes('compute resources')) {
          console.log('⚠️ Resource limit reached for large file, proceeding to sequence inference...')
        }
      }
      
      // If still no date found OR extraction failed, try sequence-based inference
      if (!originalDate) {
        console.log('Trying sequence-based inference as fallback...')
        try {
          originalDate = await inferDateFromSequence(fileData.name, fileId, accessToken)
          if (originalDate) {
            inferredFromSequence = true
            console.log('📅 Date successfully inferred from file sequence')
          }
        } catch (seqError) {
          console.error('Sequence inference also failed:', seqError.message)
        }
      }
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
      inferredFromSequence: inferredFromSequence, // Flag to indicate if date was inferred
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
    // Smart streaming approach - read files in chunks to avoid memory limits
    console.log(`Starting streaming metadata extraction for ${fileName} (${Math.floor(fileSize / 1024 / 1024)}MB)`)
    
    // Check if this is an edited file
    const isEdited = fileName.includes('.TRIM') || fileName.includes('(1)') || fileName.includes('(2)') || fileName.includes('(3)');
    if (isEdited) {
      console.log(`⚠️ EDITED FILE DETECTED: ${fileName} - metadata might be stripped during editing`)
    }

    // For large files, try streaming approach to read more data without memory issues
    if (fileSize > 100 * 1024 * 1024) {
      console.log(`Large file detected, using streaming approach for ${fileName}`)
      return await extractVideoMetadataStreaming(fileId, accessToken, fileName, fileSize)
    }

    // For smaller files, download more data at once
    const downloadSize = fileSize < 50 * 1024 * 1024 
      ? fileSize  // Download entire file if under 50MB
      : Math.min(50 * 1024 * 1024, fileSize)  // Otherwise 50MB max
    
    console.log(`Downloading ${Math.floor(downloadSize / 1024 / 1024)}MB for metadata extraction...`)
    
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
    
    // Add better debugging
    console.log('File header (first 32 bytes):', 
      Array.from(data.slice(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
    )
    
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

async function extractVideoMetadataStreaming(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    console.log(`Streaming ${fileName} (${Math.floor(fileSize / 1024 / 1024)}MB) for metadata extraction...`)
    
    // Stream in chunks to avoid memory limits
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    let buffer = new Uint8Array(0)
    let offset = 0
    let foundDate = null
    
    // Read file in chunks, keeping only what we need in memory
    while (offset < fileSize && !foundDate && offset < 100 * 1024 * 1024) { // Read up to 100MB
      const endByte = Math.min(offset + chunkSize - 1, fileSize - 1)
      
      console.log(`Reading chunk: bytes ${offset}-${endByte}`)
      
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Range': `bytes=${offset}-${endByte}`
          }
        }
      )
      
      if (!response.ok) {
        console.error(`Failed to download chunk at offset ${offset}:`, response.status)
        break
      }
      
      const chunkData = new Uint8Array(await response.arrayBuffer())
      
      // Append new chunk to buffer
      const newBuffer = new Uint8Array(buffer.length + chunkData.length)
      newBuffer.set(buffer)
      newBuffer.set(chunkData, buffer.length)
      buffer = newBuffer
      
      // Try to extract metadata from current buffer
      foundDate = extractQuickTimeMetadata(buffer)
      
      if (foundDate) {
        console.log('Found metadata via streaming!', foundDate)
        break
      }
      
      // If buffer gets too large, keep only the most recent part
      if (buffer.length > 20 * 1024 * 1024) {
        console.log('Buffer too large, keeping recent 15MB')
        buffer = buffer.slice(buffer.length - 15 * 1024 * 1024)
      }
      
      offset += chunkSize
    }
    
    if (!foundDate) {
      console.log('No metadata found via streaming')
    }
    
    return foundDate
  } catch (error) {
    console.error('Streaming extraction failed:', error)
    return null
  }
}

function extractQuickTimeMetadata(data: Uint8Array): string | null {
  try {
    console.log('Starting QuickTime atom parsing...')
    
    // First, verify this is a QuickTime/MP4 file
    const ftypStr = String.fromCharCode(data[4], data[5], data[6], data[7])
    console.log('File type:', ftypStr)
    
    let offset = 0
    
    // Parse atoms until we find moov
    while (offset < data.length - 8) {
      // Read atom size (4 bytes) and type (4 bytes)
      const atomSize = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, false)
      const atomType = String.fromCharCode(
        data[offset + 4],
        data[offset + 5], 
        data[offset + 6],
        data[offset + 7]
      )
      
      console.log(`Found atom: ${atomType} at offset ${offset}, size: ${atomSize}`)
      
      if (atomSize === 0 || atomSize > data.length - offset) {
        console.log('Invalid atom size, stopping')
        break
      }
      
      // Check for Apple-specific atoms that contain metadata
      const appleSpecificAtoms = ['©day', '©xyz', 'loci', 'keys', 'ilst', 'meta']
      
      if (appleSpecificAtoms.includes(atomType)) {
        console.log(`Found Apple-specific atom: ${atomType}`)
        const appleDate = extractAppleMetadata(data, offset, atomSize, atomType)
        if (appleDate) {
          console.log('Extracted date from Apple-specific atom:', appleDate)
          return appleDate
        }
      }
      
      if (atomType === 'moov') {
        // Found moov atom, now look for mvhd inside it
        console.log('Found moov atom, searching for mvhd inside...')
        
        let moovOffset = offset + 8 // Skip moov header
        const moovEnd = offset + atomSize
        
        while (moovOffset < moovEnd && moovOffset < data.length - 8) {
          const subAtomSize = new DataView(data.buffer, data.byteOffset + moovOffset, 4).getUint32(0, false)
          const subAtomType = String.fromCharCode(
            data[moovOffset + 4],
            data[moovOffset + 5],
            data[moovOffset + 6], 
            data[moovOffset + 7]
          )
          
          console.log(`  Found sub-atom: ${subAtomType} at offset ${moovOffset}, size: ${subAtomSize}`)
          
          if (subAtomType === 'mvhd') {
            console.log('Found mvhd atom!')
            
            // mvhd structure:
            // 0-3: size
            // 4-7: 'mvhd'
            // 8: version (1 byte)
            // 9-11: flags (3 bytes)
            // 12+: creation time (4 bytes for v0, 8 bytes for v1)
            
            const version = data[moovOffset + 8]
            console.log('mvhd version:', version)
            
            let creationTime: number
            
            if (version === 0) {
              // 32-bit creation time
              creationTime = new DataView(data.buffer, data.byteOffset + moovOffset + 12, 4).getUint32(0, false)
            } else if (version === 1) {
              // 64-bit creation time  
              const high = new DataView(data.buffer, data.byteOffset + moovOffset + 16, 4).getUint32(0, false)
              const low = new DataView(data.buffer, data.byteOffset + moovOffset + 20, 4).getUint32(0, false)
              creationTime = high * 0x100000000 + low
            } else {
              console.log('Unknown mvhd version:', version)
              return null
            }
            
            console.log('Raw creation time:', creationTime)
            
            // Convert from Mac epoch (1904) to Unix epoch (1970)
            const unixTime = creationTime - 2082844800
            console.log('Unix timestamp:', unixTime)
            
            // Validate and convert to date
            if (unixTime > 946684800 && unixTime < 1735689600) { // 2000-2025
              const date = new Date(unixTime * 1000)
              console.log('Extracted date:', date.toISOString())
              return date.toISOString()
            } else {
              console.log('Date outside valid range')
            }
          }
          
          moovOffset += subAtomSize
          if (subAtomSize === 0) break
        }
      } else if (atomType === 'udta') {
        // User data atom - common for iPhone metadata
        console.log('Found udta atom, searching for date metadata...')
        const udtaDate = searchUdtaAtom(data, offset + 8, offset + atomSize)
        if (udtaDate) {
          console.log('Found date in udta atom:', udtaDate)
          return udtaDate
        }
      }
      
      offset += atomSize
    }
    
    console.log('No mvhd atom found in proper structure')
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

function searchUdtaAtom(data: Uint8Array, start: number, end: number): string | null {
  try {
    // Search for creation_time and other date strings in udta atom
    const searchData = data.slice(start, Math.min(end, data.length))
    const text = new TextDecoder('utf-8', { fatal: false }).decode(searchData)
    
    console.log('Searching udta atom for dates, first 200 chars:', text.substring(0, 200))
    
    // iPhone often stores dates as strings in udta atoms
    const patterns = [
      /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/,
      /(\d{4}:\d{2}:\d{2}\s\d{2}:\d{2}:\d{2})/,
      /creation[_\s]?time[:\s]+([^\s\n\r"']+)/i,
      /(\d{4}[\/\-]\d{2}[\/\-]\d{2})/,
      // Look for iOS specific metadata
      /com\.apple\.quicktime\.creation\.date[^\d]*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/i,
    ]
    
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const dateStr = match[1]
        console.log('Found potential date in udta:', dateStr)
        const parsed = parseFlexibleDate(dateStr)
        if (parsed) {
          console.log('Successfully parsed udta date:', parsed)
          return parsed
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error in searchUdtaAtom:', error)
    return null
  }
}

function extractAppleMetadata(data: Uint8Array, offset: number, size: number, atomType: string): string | null {
  try {
    console.log(`Extracting Apple metadata from ${atomType} atom (size: ${size})`)
    
    if (atomType === '©day') {
      // Apple stores creation date in ©day atom
      // Format: usually after 8 bytes of header
      const dataStart = offset + 16
      const dataEnd = Math.min(offset + size, dataStart + 32)
      
      if (dataStart < data.length) {
        const dateData = data.slice(dataStart, dataEnd)
        const dateStr = new TextDecoder('utf-8', { fatal: false }).decode(dateData)
        console.log('©day atom content:', dateStr)
        
        const parsed = parseFlexibleDate(dateStr.trim())
        if (parsed) return parsed
      }
    }
    
    if (atomType === '©xyz') {
      // GPS coordinates with timestamp
      const dataStart = offset + 8
      const dataEnd = Math.min(offset + size, data.length)
      
      if (dataStart < data.length) {
        const gpsData = data.slice(dataStart, dataEnd)
        const text = new TextDecoder('utf-8', { fatal: false }).decode(gpsData)
        console.log('©xyz atom content (first 100 chars):', text.substring(0, 100))
        
        // Look for timestamp in GPS data
        const dateMatch = text.match(/(\d{4}[:\-]\d{2}[:\-]\d{2}[T\s]\d{2}:\d{2}:\d{2})/)
        if (dateMatch) {
          return parseFlexibleDate(dateMatch[1])
        }
      }
    }
    
    if (atomType === 'meta' || atomType === 'ilst' || atomType === 'keys') {
      // iTunes-style metadata atoms
      const dataStart = offset + 8
      const dataEnd = Math.min(offset + size, data.length)
      
      if (dataStart < data.length) {
        const metaData = data.slice(dataStart, dataEnd)
        const text = new TextDecoder('utf-8', { fatal: false }).decode(metaData)
        console.log(`${atomType} atom content (first 200 chars):`, text.substring(0, 200))
        
        // Look for Apple QuickTime creation date keys
        const applePatterns = [
          /com\.apple\.quicktime\.creationdate[^\d]*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/i,
          /quicktime\..*creation[^\d]*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/i,
          /©day[^\d]*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/i,
          /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/,
        ]
        
        for (const pattern of applePatterns) {
          const match = text.match(pattern)
          if (match) {
            console.log(`Found date in ${atomType} atom:`, match[1])
            const parsed = parseFlexibleDate(match[1])
            if (parsed) return parsed
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting Apple metadata:', error)
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

async function inferDateFromSequence(fileName: string, fileId: string, accessToken: string): Promise<string | null> {
  try {
    const match = fileName.match(/IMG_(\d+)/);
    if (!match) return null;
    
    const currentNumber = parseInt(match[1]);
    console.log(`Trying to infer date for ${fileName} (number: ${currentNumber})`);
    
    // Get parent folder
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!fileResponse.ok) return null;
    const fileData = await fileResponse.json();
    const parentId = fileData.parents?.[0];
    
    if (!parentId) return null;
    
    // List all video files in the same folder with size info
    const folderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${parentId}' in parents and (mimeType contains 'video')&fields=files(id,name,size,mimeType)&pageSize=100`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!folderResponse.ok) return null;
    const folderData = await folderResponse.json();
    
    // Look for nearby files in the sequence with dates
    const nearbyFiles = [];
    
    for (const file of folderData.files) {
      const fileMatch = file.name.match(/IMG_(\d+)/);
      if (!fileMatch) continue;
      
      const fileNumber = parseInt(fileMatch[1]);
      if (fileNumber === currentNumber) continue;
      
      const diff = Math.abs(fileNumber - currentNumber);
      if (diff <= 50) {
        nearbyFiles.push({
          ...file,
          number: fileNumber,
          diff: diff,
          isBefore: fileNumber < currentNumber
        });
      }
    }
    
    // Sort by proximity
    nearbyFiles.sort((a, b) => a.diff - b.diff);
    
    // Try to extract metadata from nearby files
    for (const nearbyFile of nearbyFiles) {
      console.log(`Checking nearby file ${nearbyFile.name} (${nearbyFile.diff} files away)`);
      
      try {
        // Try a lightweight metadata extraction first
        const metadata = await extractVideoMetadataLightweight(
          nearbyFile.id, 
          accessToken, 
          nearbyFile.name, 
          parseInt(nearbyFile.size || '0')
        );
        
        if (metadata) {
          console.log(`✓ Successfully inferred date from ${nearbyFile.name}`);
          return metadata;
        }
      } catch (error) {
        console.log(`Failed to extract from ${nearbyFile.name}, trying next...`);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error in sequence-based inference:', error);
    return null;
  }
}

// Add a lightweight extraction function that only reads the minimum needed
async function extractVideoMetadataLightweight(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    // Only download first 10MB for metadata
    const downloadSize = Math.min(10 * 1024 * 1024, fileSize);
    
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': `bytes=0-${downloadSize - 1}`
        }
      }
    );
    
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Try QuickTime metadata extraction
    return extractQuickTimeMetadata(data);
  } catch (error) {
    console.error('Lightweight extraction failed:', error);
    return null;
  }
}