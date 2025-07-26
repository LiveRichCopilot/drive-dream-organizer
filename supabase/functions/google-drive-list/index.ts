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

    // Also try to get folder info to verify access
    if (folderId) {
      try {
        const folderResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,capabilities`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        })
        if (folderResponse.ok) {
          const folderData = await folderResponse.json()
          console.log('Folder info:', folderData)
        } else {
          console.log('Could not access folder info:', folderResponse.status, await folderResponse.text())
        }

        // Try alternative queries to debug
        console.log('Trying alternative queries...')
        
        // Query 1: All files in folder (not just videos)
        const allFilesUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&fields=files(id,name,mimeType)&pageSize=10`
        const allFilesResponse = await fetch(allFilesUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        if (allFilesResponse.ok) {
          const allFilesData = await allFilesResponse.json()
          console.log('All files in folder:', allFilesData)
        }

        // Query 2: Try broader video search
        const broadVideoUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and (mimeType contains 'video' or name contains '.mp4' or name contains '.mov' or name contains '.avi')&fields=files(id,name,mimeType)&pageSize=10`
        const broadVideoResponse = await fetch(broadVideoUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        if (broadVideoResponse.ok) {
          const broadVideoData = await broadVideoResponse.json()
          console.log('Broad video search results:', broadVideoData)
        }

      } catch (error) {
        console.log('Error getting folder info:', error)
      }
    }

    // List video files from Google Drive
    let allVideoFiles = []
    
    // First, try the direct folder search
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
    console.log('Direct folder search results:', data.files?.length || 0, 'videos')
    allVideoFiles.push(...(data.files || []))

    // If searching a specific folder and no videos found directly, search subfolders recursively
    if (folderId && allVideoFiles.length === 0) {
      console.log('No videos in direct folder, searching subfolders recursively...')
      
      try {
        // Get all subfolders in the specified folder
        const subfoldersUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/vnd.google-apps.folder'&fields=files(id,name)&pageSize=100`
        const subfoldersResponse = await fetch(subfoldersUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        
        if (subfoldersResponse.ok) {
          const subfoldersData = await subfoldersResponse.json()
          console.log('Found subfolders:', subfoldersData.files?.map(f => f.name) || [])
          
          // Search each subfolder for videos
          for (const subfolder of subfoldersData.files || []) {
            const subfolderQuery = `mimeType contains 'video/' and '${subfolder.id}' in parents`
            const subfolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subfolderQuery)}&fields=files(id,name,size,createdTime,thumbnailLink,videoMediaMetadata)&pageSize=100`
            
            const subfolderResponse = await fetch(subfolderUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            })
            
            if (subfolderResponse.ok) {
              const subfolderData = await subfolderResponse.json()
              console.log(`Found ${subfolderData.files?.length || 0} videos in subfolder "${subfolder.name}"`)
              allVideoFiles.push(...(subfolderData.files || []))
            }
          }
        }
      } catch (error) {
        console.error('Error searching subfolders:', error)
      }
    }

    console.log('Total videos found:', allVideoFiles.length)
    
    // Transform the files to match our VideoFile interface  
    // IMPORTANT: Do NOT use Google Drive upload dates - they show upload time, not shooting time
    const videoFiles = allVideoFiles?.map((file: any) => ({
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
      dateCreated: 'Processing...', // Will be replaced with actual metadata date during processing
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