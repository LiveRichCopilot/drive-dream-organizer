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
    console.log('File metadata:', JSON.stringify(fileData, null, 2))

    // Build response with all available metadata
    const response: any = {
      fileId: fileData.id,
      fileName: fileData.name,
      fileSize: fileData.size,
      mimeType: fileData.mimeType,
      googleCreatedTime: fileData.createdTime,
      googleModifiedTime: fileData.modifiedTime,
      originalDate: null // Will be set if we find it
    }

    // Add video metadata if available
    if (fileData.videoMediaMetadata) {
      response.videoMetadata = fileData.videoMediaMetadata
      console.log('Google Drive video metadata:', JSON.stringify(fileData.videoMediaMetadata, null, 2))
    }

    // Try multiple approaches to find the original shooting date
    let originalDate: string | null = null

    // 1. Extract from filename patterns first (most reliable for iPhone/cameras)
    console.log(`Trying filename extraction for: ${fileData.name}`)
    originalDate = extractDateFromFilename(fileData.name)
    
    if (originalDate) {
      console.log(`✓ SUCCESS: Extracted date from filename: ${originalDate}`)
    } else {
      console.log('✗ No date found in filename, trying video file metadata extraction...')
      
      // 2. Download and analyze actual file metadata (EXIF, QuickTime atoms)
      originalDate = await extractVideoMetadata(fileId, accessToken, fileData.name, parseInt(fileData.size || '0'))
      
      if (originalDate) {
        console.log(`✓ SUCCESS: Extracted date from file metadata: ${originalDate}`)
      } else {
        console.log('✗ No date found in file metadata, trying sequence inference...')
        
        // 3. Try sequence-based inference (risky but sometimes works)
        originalDate = await inferDateFromSequence(fileData.name, fileId, accessToken)
        
        if (originalDate) {
          console.log(`✓ SUCCESS: Inferred date from sequence: ${originalDate}`)
        } else {
          console.log('✗ FAILED: Could not determine original shooting date')
        }
      }
    }

    // Set the original date in response
    if (originalDate) {
      response.originalDate = originalDate
      response.confidence = 'extracted' // vs 'inferred'
    }

    // Try to extract additional metadata (GPS, device info, etc.)
    try {
      console.log(`Extracting additional metadata for ${fileData.name}...`)
      const additionalMetadata = await extractAdditionalVideoMetadata(fileId, accessToken, fileData.name, parseInt(fileData.size || '0'))
      
      if (additionalMetadata) {
        if (additionalMetadata.gpsCoordinates) {
          response.gpsCoordinates = additionalMetadata.gpsCoordinates;
          console.log(`✓ GPS coordinates: ${additionalMetadata.gpsCoordinates.latitude}, ${additionalMetadata.gpsCoordinates.longitude}`);
          
          if (additionalMetadata.locationName) {
            response.locationName = additionalMetadata.locationName;
            console.log(`✓ Location: ${additionalMetadata.locationName}`);
          }
        }
        if (additionalMetadata.deviceInfo) {
          response.deviceInfo = additionalMetadata.deviceInfo;
          console.log(`✓ Device info: ${additionalMetadata.deviceInfo}`);
        }
      }
    } catch (error) {
      console.log(`Additional metadata extraction failed for ${fileData.name}:`, error);
    }

    console.log(`Metadata extraction complete for ${fileData.name}. Original date: ${originalDate || 'NOT FOUND'}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
    /(\d{4})[_-](\d{2})[_-](\d{2})[_\s-](\d{2})[_-](\d{2})[_-](\d{2})/, // YYYY-MM-DD_HH-MM-SS
    /(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/, // YYYYMMDD_HHMMSS
    /VID[_-](\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/, // VID_YYYYMMDD_HHMMSS
    /(\d{2})[_-](\d{2})[_-](\d{4})[_\s-](\d{2})[_-](\d{2})[_-](\d{2})/, // DD-MM-YYYY_HH-MM-SS
    /(\d{4})[_-](\d{1,2})[_-](\d{1,2})/, // Basic YYYY-MM-DD
  ]

  for (const pattern of patterns) {
    const match = fileName.match(pattern)
    if (match) {
      try {
        if (pattern === patterns[0]) {
          // IMG_XXXX pattern - skip for now as it needs sequence analysis
          continue
        }
        
        let year, month, day, hour = '12', minute = '00', second = '00'
        
        if (pattern === patterns[1]) {
          [, year, month, day, hour, minute, second] = match
        } else if (pattern === patterns[2]) {
          [, year, month, day, hour, minute, second] = match
        } else if (pattern === patterns[3]) {
          [, year, month, day, hour, minute, second] = match
        } else if (pattern === patterns[4]) {
          [, day, month, year, hour, minute, second] = match
        } else if (pattern === patterns[5]) {
          [, year, month, day] = match
        }

        const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.000Z`)
        if (!isNaN(date.getTime())) {
          return date.toISOString()
        }
      } catch (error) {
        console.error('Error parsing date from filename:', error)
      }
    }
  }

  return null
}

async function extractVideoMetadata(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    console.log(`Attempting metadata extraction for ${fileName} (${fileSize} bytes)`)
    
    // For large files, try streaming approach
    if (fileSize > 50 * 1024 * 1024) { // 50MB
      console.log('Large file detected, using streaming extraction')
      return await extractVideoMetadataStreaming(fileId, accessToken, fileName, fileSize)
    }
    
    // For smaller files, download and analyze
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': 'bytes=0-1048576' // First 1MB should contain metadata
        }
      }
    )

    if (!downloadResponse.ok) {
      console.error(`Failed to download file: ${downloadResponse.status}`)
      return null
    }

    const arrayBuffer = await downloadResponse.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    
    console.log(`Downloaded ${data.length} bytes for analysis`)

    // Try different extraction methods
    let extractedDate = extractQuickTimeMetadata(data)
    
    if (!extractedDate) {
      extractedDate = findCreationTimeString(data)
    }
    
    if (!extractedDate) {
      extractedDate = findGPSDateStamp(data)
    }

    if (extractedDate) {
      console.log(`✓ Successfully extracted date: ${extractedDate}`)
      return extractedDate
    }

    console.log('✗ No creation date found in file metadata')
    return null

  } catch (error) {
    console.error('Error extracting video metadata:', error)
    return null
  }
}

async function extractVideoMetadataStreaming(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    console.log(`Streaming metadata extraction for large file: ${fileName}`)
    
    // Download only the first 2MB for metadata analysis
    const chunkSize = 2 * 1024 * 1024 // 2MB
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': `bytes=0-${chunkSize - 1}`
        }
      }
    )

    if (!downloadResponse.ok) {
      console.error(`Failed to download file chunk: ${downloadResponse.status}`)
      return null
    }

    const arrayBuffer = await downloadResponse.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    
    console.log(`Downloaded ${data.length} bytes for streaming analysis`)

    // Try extraction methods optimized for streaming
    let extractedDate = extractQuickTimeMetadata(data)
    
    if (!extractedDate) {
      extractedDate = findCreationTimeString(data)
    }

    if (extractedDate) {
      console.log(`✓ Successfully extracted date from stream: ${extractedDate}`)
      return extractedDate
    }

    console.log('✗ No creation date found in file stream')
    return null

  } catch (error) {
    console.error('Error in streaming metadata extraction:', error)
    return null
  }
}

function extractQuickTimeMetadata(data: Uint8Array): string | null {
  try {
    // Look for QuickTime creation time atom 'mvhd' or 'udta'
    const mvhdPattern = new Uint8Array([0x6D, 0x76, 0x68, 0x64]) // 'mvhd'
    const udtaPattern = new Uint8Array([0x75, 0x64, 0x74, 0x61]) // 'udta'
    
    // Search for mvhd atom
    for (let i = 0; i < data.length - 100; i++) {
      if (data[i] === mvhdPattern[0] && 
          data[i + 1] === mvhdPattern[1] && 
          data[i + 2] === mvhdPattern[2] && 
          data[i + 3] === mvhdPattern[3]) {
        
        console.log(`Found mvhd atom at position ${i}`)
        
        // mvhd atom structure:
        // 4 bytes: atom size
        // 4 bytes: 'mvhd'
        // 1 byte: version
        // 3 bytes: flags
        // 4 bytes: creation time (if version 0) or 8 bytes (if version 1)
        
        const version = data[i + 8]
        let creationTime: number
        
        if (version === 0) {
          // 32-bit timestamp
          creationTime = (data[i + 12] << 24) | (data[i + 13] << 16) | (data[i + 14] << 8) | data[i + 15]
        } else {
          // 64-bit timestamp (we'll take the lower 32 bits)
          creationTime = (data[i + 16] << 24) | (data[i + 17] << 16) | (data[i + 18] << 8) | data[i + 19]
        }
        
        // Convert from Mac epoch (1904) to Unix epoch (1970)
        const macToUnixOffset = 2082844800 // seconds between 1904 and 1970
        const unixTimestamp = creationTime - macToUnixOffset
        
        if (unixTimestamp > 0 && unixTimestamp < Date.now() / 1000) {
          const date = new Date(unixTimestamp * 1000)
          console.log(`✓ Extracted QuickTime creation time: ${date.toISOString()}`)
          return date.toISOString()
        }
      }
    }
    
    // Search for udta atom (user data)
    for (let i = 0; i < data.length - 100; i++) {
      if (data[i] === udtaPattern[0] && 
          data[i + 1] === udtaPattern[1] && 
          data[i + 2] === udtaPattern[2] && 
          data[i + 3] === udtaPattern[3]) {
        
        console.log(`Found udta atom at position ${i}`)
        
        // Look for nested atoms in udta
        const result = searchUdtaAtom(data, i, Math.min(i + 1000, data.length))
        if (result) {
          return result
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting QuickTime metadata:', error)
    return null
  }
}

function findCreationTimeString(data: Uint8Array): string | null {
  try {
    // Look for common date/time string patterns in metadata
    const patterns = [
      /(\d{4})[:-](\d{2})[:-](\d{2})[T\s](\d{2})[:-](\d{2})[:-](\d{2})/g,
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/g,
    ]
    
    // Convert binary data to string for pattern matching
    const textData = new TextDecoder('utf-8', { fatal: false }).decode(data)
    
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(textData)) !== null) {
        try {
          const [, year, month, day, hour, minute, second] = match
          const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`)
          
          if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= new Date().getFullYear()) {
            console.log(`✓ Found creation time string: ${date.toISOString()}`)
            return date.toISOString()
          }
        } catch (error) {
          continue
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error finding creation time string:', error)
    return null
  }
}

function findGPSDateStamp(data: Uint8Array): string | null {
  try {
    // Look for GPS date stamps in EXIF data
    const gpsPattern = /GPS.*(\d{4})[:-](\d{2})[:-](\d{2})/g
    const textData = new TextDecoder('utf-8', { fatal: false }).decode(data)
    
    let match
    while ((match = gpsPattern.exec(textData)) !== null) {
      try {
        const [, year, month, day] = match
        const date = new Date(`${year}-${month}-${day}T12:00:00.000Z`)
        
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
          console.log(`✓ Found GPS date stamp: ${date.toISOString()}`)
          return date.toISOString()
        }
      } catch (error) {
        continue
      }
    }
    
    return null
  } catch (error) {
    console.error('Error finding GPS date stamp:', error)
    return null
  }
}

function extractDateStringAfterPosition(data: Uint8Array, position: number): string | null {
  try {
    const searchLength = Math.min(200, data.length - position)
    const searchData = data.slice(position, position + searchLength)
    const textData = new TextDecoder('utf-8', { fatal: false }).decode(searchData)
    
    const datePattern = /(\d{4})[:-](\d{2})[:-](\d{2})[T\s](\d{2})[:-](\d{2})[:-](\d{2})/
    const match = textData.match(datePattern)
    
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`)
      
      if (!isNaN(date.getTime())) {
        return date.toISOString()
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting date string after position:', error)
    return null
  }
}

function searchUdtaAtom(data: Uint8Array, start: number, end: number): string | null {
  try {
    for (let i = start; i < end - 20; i++) {
      // Look for Apple metadata atoms like ©day
      if (data[i] === 0xA9 && data[i + 1] === 0x64 && data[i + 2] === 0x61 && data[i + 3] === 0x79) {
        console.log(`Found ©day atom at position ${i}`)
        return extractAppleMetadata(data, i, end - i, 'day')
      }
      
      // Look for creation time
      if (data[i] === 0x63 && data[i + 1] === 0x72 && data[i + 2] === 0x65 && data[i + 3] === 0x61) {
        console.log(`Found creation atom at position ${i}`)
        return extractDateStringAfterPosition(data, i + 4)
      }
    }
    
    return null
  } catch (error) {
    console.error('Error searching udta atom:', error)
    return null
  }
}

function extractAppleMetadata(data: Uint8Array, offset: number, size: number, atomType: string): string | null {
  try {
    // Apple metadata format:
    // 4 bytes: atom size
    // 4 bytes: atom type (e.g., ©day)
    // 4 bytes: data atom size
    // 4 bytes: 'data'
    // 4 bytes: version and flags
    // 4 bytes: reserved
    // N bytes: actual data
    
    const atomSize = (data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7]
    
    if (atomSize > size || atomSize < 16) {
      return null
    }
    
    // Look for 'data' atom
    let dataOffset = offset + 8
    if (data[dataOffset] === 0x64 && data[dataOffset + 1] === 0x61 && 
        data[dataOffset + 2] === 0x74 && data[dataOffset + 3] === 0x61) {
      
      const dataSize = (data[dataOffset + 4] << 24) | (data[dataOffset + 5] << 16) | 
                      (data[dataOffset + 6] << 8) | data[dataOffset + 7]
      
      if (dataSize > 16 && dataSize < atomSize) {
        const actualDataOffset = dataOffset + 16 // Skip data atom header
        const actualDataSize = dataSize - 16
        
        if (actualDataOffset + actualDataSize <= data.length) {
          const metadataBytes = data.slice(actualDataOffset, actualDataOffset + actualDataSize)
          const metadataString = new TextDecoder('utf-8', { fatal: false }).decode(metadataBytes)
          
          console.log(`Apple metadata (${atomType}): ${metadataString}`)
          
          // Try to parse as date
          try {
            const date = new Date(metadataString)
            if (!isNaN(date.getTime())) {
              return date.toISOString()
            }
          } catch (error) {
            // Not a valid date, continue
          }
          
          // Try to extract date from string
          const datePattern = /(\d{4})[:-](\d{2})[:-](\d{2})/
          const match = metadataString.match(datePattern)
          if (match) {
            const [, year, month, day] = match
            const date = new Date(`${year}-${month}-${day}T12:00:00.000Z`)
            if (!isNaN(date.getTime())) {
              return date.toISOString()
            }
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
    // Try different date formats
    const formats = [
      dateStr, // As-is
      dateStr.replace(/[\/\\]/g, '-'), // Replace slashes with dashes
      dateStr.replace(/(\d{2})[-\/](\d{2})[-\/](\d{4})/, '$3-$2-$1'), // DD-MM-YYYY to YYYY-MM-DD
      dateStr.replace(/(\d{2})[-\/](\d{2})[-\/](\d{4})/, '$3-$1-$2'), // MM-DD-YYYY to YYYY-MM-DD
    ]
    
    for (const format of formats) {
      const date = new Date(format)
      if (!isNaN(date.getTime())) {
        return date.toISOString()
      }
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
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
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
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
}

function getYear(dateString: string): string {
  const date = new Date(dateString)
  return date.getFullYear().toString()
}

async function inferDateFromSequence(fileName: string, fileId: string, accessToken: string): Promise<string | null> {
  try {
    // Extract sequence number from filename - support various patterns
    let sequenceNumber: number | null = null
    let pattern = ''
    
    // Try iPhone pattern IMG_XXXX
    const imgMatch = fileName.match(/IMG_(\d{4,})/)
    if (imgMatch) {
      sequenceNumber = parseInt(imgMatch[1])
      pattern = 'IMG_'
    }
    
    // Try numbered files like 1.mov, 2.mov, etc.
    if (!sequenceNumber) {
      const numMatch = fileName.match(/^(\d+)\./)
      if (numMatch) {
        sequenceNumber = parseInt(numMatch[1])
        pattern = 'numbered'
      }
    }
    
    if (!sequenceNumber) {
      console.log('No sequence number found in filename')
      return null
    }
    
    console.log(`Found sequence number: ${sequenceNumber} (pattern: ${pattern})`)
    
    // First, get the parent folder of the current file
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )
    
    let searchQuery = ''
    if (fileResponse.ok) {
      const fileData = await fileResponse.json()
      const parentId = fileData.parents?.[0]
      
      if (parentId) {
        // Search within the same folder
        if (pattern === 'IMG_') {
          searchQuery = `name contains 'IMG_' and '${parentId}' in parents`
        } else {
          // For numbered files, search for video files in the same folder
          searchQuery = `mimeType contains 'video' and '${parentId}' in parents`
        }
      }
    }
    
    // Fallback to global search if folder-specific search fails
    if (!searchQuery) {
      searchQuery = pattern === 'IMG_' ? "name contains 'IMG_'" : "mimeType contains 'video'"
    }
    
    console.log(`Searching with query: ${searchQuery}`)
    
    // Get a list of nearby files to establish sequence pattern
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,createdTime,modifiedTime)&pageSize=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )
    
    if (!searchResponse.ok) {
      console.log('Failed to search for sequence files')
      return null
    }
    
    const searchData = await searchResponse.json()
    const sequenceFiles = searchData.files || []
    
    console.log(`Found ${sequenceFiles.length} potential sequence files`)
    
    // Extract sequence numbers and dates
    const sequences: Array<{number: number, date: Date}> = []
    
    for (const file of sequenceFiles) {
      let seqNum: number | null = null
      
      if (pattern === 'IMG_') {
        const match = file.name.match(/IMG_(\d{4,})/)
        if (match) {
          seqNum = parseInt(match[1])
        }
      } else if (pattern === 'numbered') {
        const match = file.name.match(/^(\d+)\./)
        if (match) {
          seqNum = parseInt(match[1])
        }
      }
      
      if (seqNum !== null) {
        // Use modifiedTime if available, fallback to createdTime
        const dateToUse = file.modifiedTime || file.createdTime
        const date = new Date(dateToUse)
        
        // Only include files with reasonable sequence numbers (within range)
        const maxRange = pattern === 'IMG_' ? 1000 : 100
        if (Math.abs(seqNum - sequenceNumber) <= maxRange) {
          sequences.push({ number: seqNum, date })
          console.log(`Added sequence ${seqNum} with date ${date.toISOString()}`)
        }
      }
    }
    
    if (sequences.length < 2) {
      console.log('Not enough sequence files for inference')
      return null
    }
    
    // Sort by sequence number
    sequences.sort((a, b) => a.number - b.number)
    
    // Find the closest sequences to our target
    let beforeSeq = null
    let afterSeq = null
    
    for (let i = 0; i < sequences.length; i++) {
      if (sequences[i].number < sequenceNumber) {
        beforeSeq = sequences[i]
      } else if (sequences[i].number > sequenceNumber && !afterSeq) {
        afterSeq = sequences[i]
        break
      }
    }
    
    if (!beforeSeq && !afterSeq) {
      console.log('No reference sequences found')
      return null
    }
    
    // Interpolate date
    let inferredDate: Date
    
    if (beforeSeq && afterSeq) {
      // Interpolate between the two
      const ratio = (sequenceNumber - beforeSeq.number) / (afterSeq.number - beforeSeq.number)
      const timeDiff = afterSeq.date.getTime() - beforeSeq.date.getTime()
      const interpolatedTime = beforeSeq.date.getTime() + (timeDiff * ratio)
      inferredDate = new Date(interpolatedTime)
      
      console.log(`Interpolated between seq ${beforeSeq.number} and ${afterSeq.number}`)
    } else if (beforeSeq) {
      // Extrapolate forward from the before sequence
      // Assume average of 1 photo per day (rough estimate)
      const daysDiff = sequenceNumber - beforeSeq.number
      inferredDate = new Date(beforeSeq.date.getTime() + (daysDiff * 24 * 60 * 60 * 1000))
      
      console.log(`Extrapolated forward from seq ${beforeSeq.number}`)
    } else if (afterSeq) {
      // Extrapolate backward from the after sequence
      const daysDiff = afterSeq.number - sequenceNumber
      inferredDate = new Date(afterSeq.date.getTime() - (daysDiff * 24 * 60 * 60 * 1000))
      
      console.log(`Extrapolated backward from seq ${afterSeq.number}`)
    } else {
      return null
    }
    
    // Validate the inferred date is reasonable
    if (validateInferredDate(inferredDate.toISOString(), fileName)) {
      console.log(`✓ Inferred date: ${inferredDate.toISOString()}`)
      return inferredDate.toISOString()
    } else {
      console.log('✗ Inferred date failed validation')
      return null
    }
    
  } catch (error) {
    console.error('Error inferring date from sequence:', error)
    return null
  }
}

// Extract additional metadata including GPS and device info
async function extractAdditionalVideoMetadata(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<{
  gpsCoordinates?: { latitude: number, longitude: number },
  locationName?: string,
  deviceInfo?: string
} | null> {
  try {
    console.log(`Extracting additional metadata for ${fileName}`)
    
    // Download a larger chunk for comprehensive metadata analysis
    const chunkSize = Math.min(5 * 1024 * 1024, fileSize) // 5MB or full file if smaller
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': `bytes=0-${chunkSize - 1}`
        }
      }
    )

    if (!downloadResponse.ok) {
      console.error(`Failed to download file for additional metadata: ${downloadResponse.status}`)
      return null
    }

    const arrayBuffer = await downloadResponse.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    
    const result: any = {}
    
    // Extract GPS coordinates
    const gpsCoordinates = extractGPSCoordinates(data)
    if (gpsCoordinates) {
      result.gpsCoordinates = gpsCoordinates
      
      // Try reverse geocoding to get location name
      try {
        const locationName = await reverseGeocode(gpsCoordinates.latitude, gpsCoordinates.longitude)
        if (locationName) {
          result.locationName = locationName
        }
      } catch (error) {
        console.log('Reverse geocoding failed:', error)
      }
    }
    
    // Extract device information
    const deviceInfo = extractDeviceInfo(data)
    if (deviceInfo) {
      result.deviceInfo = deviceInfo
    }
    
    return Object.keys(result).length > 0 ? result : null
    
  } catch (error) {
    console.error('Error extracting additional video metadata:', error)
    return null
  }
}

// Extract GPS coordinates from video metadata
function extractGPSCoordinates(data: Uint8Array): { latitude: number, longitude: number } | null {
  try {
    // Try different GPS extraction methods
    
    // 1. Look for ©xyz atom (Apple's GPS format)
    let gpsData = searchForGPSInXYZAtom(data)
    if (gpsData) {
      return gpsData
    }
    
    // 2. Look for standard GPS atoms
    gpsData = searchForStandardGPSAtoms(data)
    if (gpsData) {
      return gpsData
    }
    
    // 3. Look for EXIF GPS data
    gpsData = searchForEXIFGPS(data)
    if (gpsData) {
      return gpsData
    }
    
    console.log('No GPS coordinates found in video metadata')
    return null
    
  } catch (error) {
    console.error('Error extracting GPS coordinates:', error)
    return null
  }
}

// Search for GPS coordinates in ©xyz atom
function searchForGPSInXYZAtom(data: Uint8Array): { latitude: number, longitude: number } | null {
  try {
    // Look for ©xyz atom
    const xyzPattern = [0xA9, 0x78, 0x79, 0x7A] // ©xyz
    
    for (let i = 0; i < data.length - 50; i++) {
      if (data[i] === xyzPattern[0] && 
          data[i + 1] === xyzPattern[1] && 
          data[i + 2] === xyzPattern[2] && 
          data[i + 3] === xyzPattern[3]) {
        
        console.log(`Found ©xyz atom at position ${i}`)
        
        // Apple ©xyz format typically contains ISO 6709 coordinate string
        const result = extractStringFromAtom(data, i)
        if (result) {
          // Parse ISO 6709 format: +DD.DDDD+DDD.DDDD/ or similar
          const coordMatch = result.match(/([+-]?\d+\.?\d*)\s*([+-]?\d+\.?\d*)/)
          if (coordMatch) {
            const lat = parseFloat(coordMatch[1])
            const lon = parseFloat(coordMatch[2])
            
            if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
              console.log(`✓ Extracted GPS from ©xyz: ${lat}, ${lon}`)
              return { latitude: lat, longitude: lon }
            }
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error searching for GPS in ©xyz atom:', error)
    return null
  }
}

// Search for standard GPS atoms
function searchForStandardGPSAtoms(data: Uint8Array): { latitude: number, longitude: number } | null {
  try {
    // Look for GPS-related atoms in QuickTime metadata
    const gpsPatterns = [
      [0x6C, 0x6F, 0x63, 0x69], // 'loci' - location information
      [0x67, 0x70, 0x73, 0x20], // 'gps '
    ]
    
    for (const pattern of gpsPatterns) {
      for (let i = 0; i < data.length - 50; i++) {
        if (data[i] === pattern[0] && 
            data[i + 1] === pattern[1] && 
            data[i + 2] === pattern[2] && 
            data[i + 3] === pattern[3]) {
          
          console.log(`Found GPS atom at position ${i}`)
          
          // Try to parse GPS data from this position
          const gpsData = parseGPSFromBinaryData(data, i + 8)
          if (gpsData) {
            return gpsData
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error searching for standard GPS atoms:', error)
    return null
  }
}

// Parse GPS coordinates from binary data
function parseGPSFromBinaryData(data: Uint8Array, offset: number): { latitude: number, longitude: number } | null {
  try {
    // Different formats for GPS data in atoms
    
    // Format 1: 4-byte float latitude, 4-byte float longitude
    if (offset + 8 < data.length) {
      const latBytes = data.slice(offset, offset + 4)
      const lonBytes = data.slice(offset + 4, offset + 8)
      
      // Try big-endian float interpretation
      const latView = new DataView(latBytes.buffer, latBytes.byteOffset, 4)
      const lonView = new DataView(lonBytes.buffer, lonBytes.byteOffset, 4)
      
      try {
        const lat = latView.getFloat32(0, false) // big-endian
        const lon = lonView.getFloat32(0, false)
        
        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          console.log(`✓ Extracted GPS from binary (BE float): ${lat}, ${lon}`)
          return { latitude: lat, longitude: lon }
        }
      } catch (error) {
        // Try little-endian
        try {
          const lat = latView.getFloat32(0, true) // little-endian
          const lon = lonView.getFloat32(0, true)
          
          if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            console.log(`✓ Extracted GPS from binary (LE float): ${lat}, ${lon}`)
            return { latitude: lat, longitude: lon }
          }
        } catch (error2) {
          // Continue to other formats
        }
      }
    }
    
    // Format 2: Look for text-based coordinates in the vicinity
    const searchLength = Math.min(100, data.length - offset)
    const searchData = data.slice(offset, offset + searchLength)
    const textData = new TextDecoder('utf-8', { fatal: false }).decode(searchData)
    
    const coordMatch = textData.match(/([+-]?\d+\.?\d*)\s*[,\s]\s*([+-]?\d+\.?\d*)/)
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lon = parseFloat(coordMatch[2])
      
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        console.log(`✓ Extracted GPS from text: ${lat}, ${lon}`)
        return { latitude: lat, longitude: lon }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error parsing GPS from binary data:', error)
    return null
  }
}

// Search for EXIF GPS data
function searchForEXIFGPS(data: Uint8Array): { latitude: number, longitude: number } | null {
  try {
    // Look for EXIF header
    const exifPattern = [0x45, 0x78, 0x69, 0x66] // 'Exif'
    
    for (let i = 0; i < data.length - 100; i++) {
      if (data[i] === exifPattern[0] && 
          data[i + 1] === exifPattern[1] && 
          data[i + 2] === exifPattern[2] && 
          data[i + 3] === exifPattern[3]) {
        
        console.log(`Found EXIF header at position ${i}`)
        
        // Try to parse EXIF GPS data
        const gpsData = parseEXIFGPSData(data, i)
        if (gpsData) {
          return gpsData
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error searching for EXIF GPS:', error)
    return null
  }
}

// Parse EXIF GPS data
function parseEXIFGPSData(data: Uint8Array, exifStart: number): { latitude: number, longitude: number } | null {
  try {
    // EXIF GPS parsing is complex, so we'll do a simplified search
    // Look for GPS latitude and longitude reference tags
    const searchLength = Math.min(1000, data.length - exifStart)
    const searchData = data.slice(exifStart, exifStart + searchLength)
    
    // Look for GPS coordinate patterns in the EXIF data
    let lat: number | null = null
    let lon: number | null = null
    
    // Search for GPS coordinate values (simplified)
    for (let i = 0; i < searchData.length - 20; i++) {
      // Look for patterns that might indicate GPS coordinates
      // This is a simplified approach - full EXIF parsing would be more complex
      
      const chunk = searchData.slice(i, i + 20)
      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      
      try {
        for (let j = 0; j < chunk.length - 8; j += 4) {
          const value1 = view.getFloat32(j, false) // big-endian
          const value2 = view.getFloat32(j + 4, false)
          
          // Check if these could be latitude/longitude
          if (!isNaN(value1) && !isNaN(value2) && 
              value1 >= -90 && value1 <= 90 && 
              value2 >= -180 && value2 <= 180 &&
              (Math.abs(value1) > 0.001 || Math.abs(value2) > 0.001)) {
            
            console.log(`✓ Potential GPS coordinates found in EXIF: ${value1}, ${value2}`)
            return { latitude: value1, longitude: value2 }
          }
        }
      } catch (error) {
        continue
      }
    }
    
    return null
  } catch (error) {
    console.error('Error parsing EXIF GPS data:', error)
    return null
  }
}

// Extract device information
function extractDeviceInfo(data: Uint8Array): string | null {
  try {
    // Look for device-related atoms
    const deviceAtoms = [
      [0xA9, 0x6D, 0x61, 0x6B], // ©mak - make
      [0xA9, 0x6D, 0x6F, 0x64], // ©mod - model
      [0xA9, 0x73, 0x77, 0x72], // ©swr - software
    ]
    
    const deviceInfo: string[] = []
    
    for (const atom of deviceAtoms) {
      for (let i = 0; i < data.length - 50; i++) {
        if (data[i] === atom[0] && 
            data[i + 1] === atom[1] && 
            data[i + 2] === atom[2] && 
            data[i + 3] === atom[3]) {
          
          const result = extractStringFromAtom(data, i)
          if (result && result.trim().length > 0) {
            deviceInfo.push(result.trim())
          }
        }
      }
    }
    
    if (deviceInfo.length > 0) {
      const info = deviceInfo.join(' ')
      console.log(`✓ Extracted device info: ${info}`)
      return info
    }
    
    return null
  } catch (error) {
    console.error('Error extracting device info:', error)
    return null
  }
}

// Helper function to extract string from atom
function extractStringFromAtom(data: Uint8Array, atomStart: number): string | null {
  try {
    // Standard atom structure: size(4) + type(4) + data
    const atomSize = (data[atomStart + 4] << 24) | (data[atomStart + 5] << 16) | 
                    (data[atomStart + 6] << 8) | data[atomStart + 7]
    
    if (atomSize > 1000 || atomSize < 8) {
      return null
    }
    
    // Look for data atom inside
    const dataStart = atomStart + 8
    const maxSearch = Math.min(atomStart + atomSize, data.length)
    
    for (let i = dataStart; i < maxSearch - 8; i++) {
      if (data[i] === 0x64 && data[i + 1] === 0x61 && 
          data[i + 2] === 0x74 && data[i + 3] === 0x61) {
        
        const dataSize = (data[i + 4] << 24) | (data[i + 5] << 16) | 
                        (data[i + 6] << 8) | data[i + 7]
        
        if (dataSize > 16 && i + dataSize <= data.length) {
          const stringStart = i + 16 // Skip data atom header
          const stringLength = dataSize - 16
          const stringData = data.slice(stringStart, stringStart + stringLength)
          
          return new TextDecoder('utf-8', { fatal: false }).decode(stringData)
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extracting string from atom:', error)
    return null
  }
}

// Reverse geocoding to get location name from coordinates
async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    // Using a free geocoding service (you might want to use a proper API key in production)
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      {
        headers: {
          'User-Agent': 'VideoOrganizerApp/1.0'
        }
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      
      // Build location string from available components
      const components = []
      if (data.city) components.push(data.city)
      if (data.principalSubdivision) components.push(data.principalSubdivision)
      if (data.countryName) components.push(data.countryName)
      
      if (components.length > 0) {
        const location = components.join(', ')
        console.log(`✓ Reverse geocoded: ${location}`)
        return location
      }
    }
    
    return null
  } catch (error) {
    console.log('Reverse geocoding failed:', error)
    return null
  }
}

// Add a lightweight extraction function that only reads the minimum needed
async function extractVideoMetadataLightweight(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    console.log(`Lightweight metadata extraction for ${fileName}`)
    
    // Only download the first 512KB for basic metadata
    const chunkSize = 512 * 1024 // 512KB
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': `bytes=0-${chunkSize - 1}`
        }
      }
    )

    if (!downloadResponse.ok) {
      return null
    }

    const arrayBuffer = await downloadResponse.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    
    // Quick extraction methods only
    return extractQuickTimeMetadata(data) || findCreationTimeString(data)
    
  } catch (error) {
    console.error('Error in lightweight metadata extraction:', error)
    return null
  }
}

// Date validation function to ensure inferred dates are reasonable
function validateInferredDate(inferredDate: string, fileName: string): boolean {
  try {
    const date = new Date(inferredDate);
    const currentDate = new Date();
    
    // Basic sanity checks
    if (isNaN(date.getTime())) {
      console.log('Invalid date format');
      return false;
    }
    
    // Date should be between 2000 and current date + 1 year
    const minDate = new Date('2000-01-01');
    const maxDate = new Date(currentDate.getFullYear() + 1, 11, 31);
    
    if (date < minDate || date > maxDate) {
      console.log(`Date ${inferredDate} outside valid range (${minDate.toISOString()} - ${maxDate.toISOString()})`);
      return false;
    }
    
    // For iPhone sequences (IMG_XXXX), dates should be reasonable for photography
    // Most people don't take videos before 2007 (iPhone launch) or in the far future
    if (fileName.includes('IMG_')) {
      const iphoneLaunch = new Date('2007-01-01');
      if (date < iphoneLaunch) {
        console.log(`iPhone file date ${inferredDate} before iPhone launch (2007)`);
        return false;
      }
    }
    
    console.log(`✓ Date ${inferredDate} passed validation for ${fileName}`);
    return true;
  } catch (error) {
    console.error('Error validating date:', error);
    return false;
  }
}