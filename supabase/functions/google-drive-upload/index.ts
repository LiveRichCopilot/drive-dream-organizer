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

    const { 
      processedVideos, 
      destinationFolderName,
      organizationStructure 
    } = await req.json()
    
    if (!processedVideos || !destinationFolderName) {
      return new Response(
        JSON.stringify({ error: 'Processed videos and destination folder name required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Uploading ${processedVideos.length} videos to folder: ${destinationFolderName}`)

    // Step 1: Create the main destination folder
    const mainFolderResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: destinationFolderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      }
    )

    if (!mainFolderResponse.ok) {
      throw new Error('Failed to create main destination folder')
    }

    const mainFolder = await mainFolderResponse.json()
    console.log('Created main folder:', mainFolder.id)

    // Step 2: Create subfolders based on organization structure
    const folderMap = new Map()
    folderMap.set('root', mainFolder.id)

    if (organizationStructure && organizationStructure.folders) {
      for (const folder of organizationStructure.folders) {
        const subfolderResponse = await fetch(
          'https://www.googleapis.com/drive/v3/files',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: folder.name,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [mainFolder.id]
            })
          }
        )

        if (subfolderResponse.ok) {
          const subfolder = await subfolderResponse.json()
          folderMap.set(folder.name, subfolder.id)
          console.log(`Created subfolder ${folder.name}:`, subfolder.id)
        }
      }
    }

    // Step 3: Process each video
    const uploadedVideos = []
    let successCount = 0
    let errorCount = 0

    for (const video of processedVideos) {
      try {
        // Determine target folder
        const videoDate = new Date(video.originalDate)
        const yearMonth = `${videoDate.getFullYear()}/${String(videoDate.getMonth() + 1).padStart(2, '0')}-${videoDate.toLocaleDateString('en', { month: 'long' })}`
        const targetFolderId = folderMap.get(yearMonth) || mainFolder.id

        // Step 3a: Download the original file
        const downloadResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${video.id}?alt=media`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        )

        if (!downloadResponse.ok) {
          throw new Error(`Failed to download video ${video.originalName}`)
        }

        const videoBlob = await downloadResponse.blob()
        console.log(`Downloaded ${video.originalName} (${videoBlob.size} bytes)`)

        // Step 3b: Upload with new name to organized folder
        const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
        
        const formData = new FormData()
        
        // Metadata for the new file
        const metadata = {
          name: video.newName,
          parents: [targetFolderId],
          description: `Organized video - Original: ${video.originalName}, Created: ${video.originalDate}`
        }
        
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
        formData.append('file', videoBlob)

        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        })

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload ${video.newName}`)
        }

        const uploadedFile = await uploadResponse.json()
        uploadedVideos.push({
          ...video,
          newId: uploadedFile.id,
          uploadedPath: `${destinationFolderName}/${yearMonth}/${video.newName}`,
          uploadSuccess: true
        })

        successCount++
        console.log(`Successfully uploaded ${video.newName} to ${yearMonth}`)

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`Failed to process video ${video.originalName}:`, error)
        uploadedVideos.push({
          ...video,
          uploadSuccess: false,
          error: error.message
        })
        errorCount++
      }
    }

    // Step 4: Return results
    const results = {
      success: true,
      mainFolderId: mainFolder.id,
      mainFolderName: destinationFolderName,
      uploadedVideos,
      statistics: {
        totalVideos: processedVideos.length,
        successCount,
        errorCount,
        successRate: Math.round((successCount / processedVideos.length) * 100)
      },
      folderStructure: {
        mainFolder: {
          id: mainFolder.id,
          name: destinationFolderName,
          webViewLink: `https://drive.google.com/drive/folders/${mainFolder.id}`
        },
        subfolders: Array.from(folderMap.entries())
          .filter(([name]) => name !== 'root')
          .map(([name, id]) => ({
            name,
            id,
            webViewLink: `https://drive.google.com/drive/folders/${id}`
          }))
      }
    }

    console.log('Upload completed:', results.statistics)

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in google-drive-upload function:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})