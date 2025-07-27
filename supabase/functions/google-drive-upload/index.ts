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
      organizationStructure,
      sourceFolderId,
      projectFiles 
    } = await req.json()
    
    if (!processedVideos || !destinationFolderName) {
      return new Response(
        JSON.stringify({ error: 'Processed videos and destination folder name required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Organizing ${processedVideos.length} videos in source folder: ${sourceFolderId || 'root'}`)

    // Step 1: Create the organized folder within the source folder (not at root)
    const parentFolderId = sourceFolderId || null; // Use source folder as parent
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
          mimeType: 'application/vnd.google-apps.folder',
          parents: parentFolderId ? [parentFolderId] : undefined
        })
      }
    )

    if (!mainFolderResponse.ok) {
      const errorDetails = await mainFolderResponse.text()
      console.error('Google Drive API error when creating folder:', {
        status: mainFolderResponse.status,
        statusText: mainFolderResponse.statusText,
        error: errorDetails,
        folderName: destinationFolderName,
        parentFolderId: parentFolderId
      })
      throw new Error(`Failed to create main destination folder: ${mainFolderResponse.status} ${errorDetails}`)
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

    // Step 3: Process videos one at a time to avoid memory issues
    const uploadedVideos = []
    let successCount = 0
    let errorCount = 0

    console.log(`Processing ${processedVideos.length} videos one at a time to avoid memory issues`)

    for (let i = 0; i < processedVideos.length; i++) {
      const video = processedVideos[i]
      console.log(`Processing video ${i + 1}/${processedVideos.length}: ${video.originalName}`)

      try {
        // Use the original date for folder organization
        const originalDate = new Date(video.originalDate)
        const yearMonth = `${originalDate.getFullYear()}/${String(originalDate.getMonth() + 1).padStart(2, '0')}-${originalDate.toLocaleDateString('en', { month: 'long' })}`
        let targetFolderId = folderMap.get(yearMonth)
        
        // Create subfolder if it doesn't exist
        if (!targetFolderId) {
          const subfolderResponse = await fetch(
            'https://www.googleapis.com/drive/v3/files',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: yearMonth,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [mainFolder.id]
              })
            }
          )

          if (subfolderResponse.ok) {
            const subfolder = await subfolderResponse.json()
            folderMap.set(yearMonth, subfolder.id)
            targetFolderId = subfolder.id
            console.log(`Created subfolder ${yearMonth}:`, subfolder.id)
          } else {
            targetFolderId = mainFolder.id // Fallback to main folder
          }
        }

        // Use Google Drive copy operation instead of download/upload to avoid memory issues
        const copyResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${video.id}/copy`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: video.newName,
              parents: [targetFolderId],
              description: `Organized video - Original: ${video.originalName}, Created: ${video.originalDate}`
            })
          }
        )

        if (!copyResponse.ok) {
          throw new Error(`Failed to copy video ${video.originalName}`)
        }

        const copiedFile = await copyResponse.json()
        console.log(`Successfully uploaded ${video.newName} to ${yearMonth}`)

        uploadedVideos.push({
          ...video,
          newId: copiedFile.id,
          uploadedPath: `${destinationFolderName}/${yearMonth}/${video.newName}`,
          uploadSuccess: true
        })
        
        successCount++

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`Error processing video ${video.originalName}:`, error)
        uploadedVideos.push({
          ...video,
          uploadSuccess: false,
          error: error.message
        })
        errorCount++
      }
    }

    // Step 4: Upload project files to the main organized folder
    const uploadedProjectFiles = []
    if (projectFiles && projectFiles.length > 0) {
      console.log(`Uploading ${projectFiles.length} project files to Google Drive...`)
      
      for (const projectFile of projectFiles) {
        try {
          // Convert project file content to a blob and upload
          const content = typeof projectFile.content === 'string' 
            ? new TextEncoder().encode(projectFile.content)
            : projectFile.content

          // Create the project file in Google Drive
          const fileResponse = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'multipart/related; boundary="foo_bar_baz"'
              },
              body: [
                '--foo_bar_baz',
                'Content-Type: application/json; charset=UTF-8',
                '',
                JSON.stringify({
                  name: projectFile.name,
                  parents: [mainFolder.id],
                  description: `Project file for organized videos - Generated on ${new Date().toISOString()}`
                }),
                '--foo_bar_baz',
                `Content-Type: ${projectFile.type === 'premiere' ? 'application/octet-stream' : 'application/json'}`,
                '',
                projectFile.content,
                '--foo_bar_baz--'
              ].join('\r\n')
            }
          )

          if (fileResponse.ok) {
            const uploadedFile = await fileResponse.json()
            uploadedProjectFiles.push({
              ...projectFile,
              googleDriveId: uploadedFile.id,
              webViewLink: `https://drive.google.com/file/d/${uploadedFile.id}/view`,
              downloadLink: `https://drive.google.com/uc?id=${uploadedFile.id}`
            })
            console.log(`✅ Uploaded project file: ${projectFile.name}`)
          } else {
            console.error(`❌ Failed to upload project file: ${projectFile.name}`)
          }
        } catch (error) {
          console.error(`Error uploading project file ${projectFile.name}:`, error)
        }
      }
    }

    // Step 5: Return results
    const results = {
      success: true,
      mainFolderId: mainFolder.id,
      mainFolderName: destinationFolderName,
      uploadedVideos,
      uploadedProjectFiles,
      statistics: {
        totalVideos: processedVideos.length,
        successCount,
        errorCount,
        successRate: Math.round((successCount / processedVideos.length) * 100),
        projectFilesUploaded: uploadedProjectFiles.length
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