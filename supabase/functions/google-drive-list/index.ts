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

    // Get folder ID from request body
    const body = await req.json().catch(() => ({}))
    const folderId = body.folderId

    // Build query for Google Drive API
    let query = "mimeType contains 'video/'"
    if (folderId) {
      query += ` and '${folderId}' in parents`
    }

    console.log('Searching for videos with query:', query)
    console.log('Folder ID:', folderId)

    // List video files from Google Drive
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,createdTime,thumbnailLink,videoMediaMetadata)&pageSize=100`
    console.log('Full Drive API URL:', driveUrl)
    
    const response = await fetch(driveUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    console.log('Google Drive API response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Google Drive API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch files from Google Drive', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    console.log('Google Drive API response:', JSON.stringify(data, null, 2))
    
    // Transform the files to match our VideoFile interface
    const videoFiles = data.files?.map((file: any) => ({
      id: file.id,
      name: file.name,
      size: file.size ? parseInt(file.size) : 0,
      sizeFormatted: file.size ? formatFileSize(parseInt(file.size)) : 'Unknown',
      createdTime: file.createdTime,
      thumbnailLink: file.thumbnailLink,
      duration: file.videoMediaMetadata?.durationMillis ? 
        Math.round(parseInt(file.videoMediaMetadata.durationMillis) / 1000) : 0,
      durationFormatted: file.videoMediaMetadata?.durationMillis ? 
        formatDuration(Math.round(parseInt(file.videoMediaMetadata.durationMillis) / 1000)) : 'Unknown',
      thumbnail: file.thumbnailLink || '/placeholder.svg',
      format: getVideoFormat(file.name),
      dateCreated: new Date(file.createdTime).toLocaleDateString(),
      webViewLink: `https://drive.google.com/file/d/${file.id}/view`
    })) || []

    return new Response(
      JSON.stringify({ files: videoFiles }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function getVideoFormat(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  const formatMap: Record<string, string> = {
    'mp4': 'MP4',
    'mov': 'MOV',
    'avi': 'AVI',
    'webm': 'WEBM',
    'mkv': 'MKV'
  }
  return formatMap[extension || ''] || 'VIDEO'
}