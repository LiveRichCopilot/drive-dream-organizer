import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VideoFile {
  id: string
  name: string
  path: string
  duration: number
  resolution: string
  fps: number
  originalDate: string
  metadata: any
}

interface ProjectSettings {
  projectName: string
  outputFormat: 'capcut' | 'premiere' | 'both'
  timeline: {
    frameRate: number
    resolution: string
    sequence: 'chronological' | 'custom'
  }
  organization: {
    groupByDate: boolean
    createSubsequences: boolean
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { videos, settings }: { videos: VideoFile[], settings: ProjectSettings } = await req.json()
    
    if (!videos || videos.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Videos array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Generating project files for ${videos.length} videos`)

    const projectFiles: any[] = []

    // Generate CapCut project file
    if (settings.outputFormat === 'capcut' || settings.outputFormat === 'both') {
      const capCutProject = generateCapCutProject(videos, settings)
      projectFiles.push({
        type: 'capcut',
        name: `${settings.projectName}.ccp`,
        content: capCutProject,
        downloadUrl: await createDownloadableFile(capCutProject, 'capcut')
      })
    }

    // Generate Premiere Pro project file
    if (settings.outputFormat === 'premiere' || settings.outputFormat === 'both') {
      const premiereProject = generatePremiereProject(videos, settings)
      projectFiles.push({
        type: 'premiere',
        name: `${settings.projectName}.xml`,
        content: premiereProject,
        downloadUrl: await createDownloadableFile(premiereProject, 'premiere')
      })
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        projectFiles,
        videoCount: videos.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in project-file-generator function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function generateCapCutProject(videos: VideoFile[], settings: ProjectSettings) {
  // Sort videos chronologically if requested
  const sortedVideos = settings.timeline.sequence === 'chronological' 
    ? videos.sort((a, b) => new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime())
    : videos

  const project = {
    version: "3.8.0",
    platform: "web",
    project_id: generateUUID(),
    created_at: new Date().toISOString(),
    project_name: settings.projectName,
    
    // Canvas settings
    canvas: {
      width: parseInt(settings.timeline.resolution.split('x')[0]),
      height: parseInt(settings.timeline.resolution.split('x')[1]),
      fps: settings.timeline.frameRate,
      duration: calculateTotalDuration(sortedVideos)
    },

    // Timeline tracks
    tracks: [
      {
        id: "video_track_1",
        type: "video",
        clips: sortedVideos.map((video, index) => ({
          id: `clip_${index}`,
          type: "video",
          source: {
            file_path: video.name, // Use just filename for local reference
            name: video.name,
            duration: video.duration,
            fps: video.fps || 30
          },
          timeline: {
            start_time: calculateClipStartTime(sortedVideos, index),
            duration: video.duration,
            in_point: 0,
            out_point: video.duration
          },
          properties: {
            volume: 1.0,
            opacity: 1.0,
            position: { x: 0, y: 0 },
            scale: 1.0,
            rotation: 0
          }
        }))
      }
    ],

    // Resources
    resources: sortedVideos.map(video => ({
      id: video.id,
      type: "video",
      path: video.name, // Use just filename for local reference
      name: video.name,
      metadata: {
        duration: video.duration,
        resolution: video.resolution,
        fps: video.fps || 30,
        original_date: video.originalDate
      }
    })),

    // Project metadata with proper CapCut format
    "type": "capcut_project",
    "version": "1.0.0",
    "id": generateUUID(),
    "name": settings.projectName,
    "fps": settings.timeline.frameRate,
    "duration": sortedVideos.reduce((sum, v) => sum + (v.duration * 1000), 0),
    "width": parseInt(settings.timeline.resolution.split('x')[0]),
    "height": parseInt(settings.timeline.resolution.split('x')[1]),
    "materials": sortedVideos.map((video, index) => ({
      "id": `material_${index}`,
      "type": "video", 
      "name": video.name,
      "path": video.name,
      "duration": video.duration * 1000,
      "width": parseInt(video.resolution?.split('x')[0] || '1920'),
      "height": parseInt(video.resolution?.split('x')[1] || '1080'),
      "fps": video.fps || settings.timeline.frameRate
    }))
  }

  return JSON.stringify(project, null, 2)
}

function generatePremiereProject(videos: VideoFile[], settings: ProjectSettings) {
  const sortedVideos = settings.timeline.sequence === 'chronological' 
    ? videos.sort((a, b) => new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime())
    : videos

  const fps = settings.timeline.frameRate || 30
  const totalFrames = sortedVideos.reduce((sum, v) => sum + Math.round((v.duration / 1000) * fps), 0)

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <project>
    <name>${settings.projectName}</name>
    <children>
      <sequence id="sequence-1">
        <name>${settings.projectName}_Timeline</name>
        <duration>${totalFrames}</duration>
        <rate>
          <ntsc>FALSE</ntsc>
          <timebase>${fps}</timebase>
        </rate>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <width>${parseInt(settings.timeline.resolution.split('x')[0])}</width>
                <height>${parseInt(settings.timeline.resolution.split('x')[1])}</height>
                <pixelaspectratio>square</pixelaspectratio>
                <rate>
                  <timebase>${fps}</timebase>
                </rate>
              </samplecharacteristics>
            </format>
            <track>
              ${sortedVideos.map((video, index) => {
                const startFrame = sortedVideos.slice(0, index).reduce((sum, v) => sum + Math.round((v.duration / 1000) * fps), 0)
                const endFrame = startFrame + Math.round((video.duration / 1000) * fps)
                
                return `
              <clipitem id="clipitem-${index + 1}">
                <name>${video.name}</name>
                <start>${startFrame}</start>
                <end>${endFrame}</end>
                <in>0</in>
                <out>${Math.round((video.duration / 1000) * fps)}</out>
                <file id="file-${index + 1}">
                  <name>${video.name}</name>
                  <pathurl>file://localhost/${video.name}</pathurl>
                  <rate>
                    <timebase>${fps}</timebase>
                  </rate>
                  <duration>${Math.round((video.duration / 1000) * fps)}</duration>
                  <media>
                    <video>
                      <samplecharacteristics>
                        <width>${parseInt(video.resolution?.split('x')[0] || '1920')}</width>
                        <height>${parseInt(video.resolution?.split('x')[1] || '1080')}</height>
                      </samplecharacteristics>
                    </video>
                  </media>
                </file>
              </clipitem>`
              }).join('')}
            </track>
          </video>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`

  return xml
}

function createDateBasedSubsequences(videos: VideoFile[]) {
  const groupedByDate = groupVideosByDate(videos)
  
  return Object.entries(groupedByDate).map(([date, dateVideos]) => ({
    id: `subseq_${date}`,
    name: `Videos from ${date}`,
    clips: dateVideos.map(video => video.id),
    duration: dateVideos.reduce((sum, v) => sum + v.duration, 0)
  }))
}

function createDateBasedBins(videos: VideoFile[]) {
  const groupedByDate = groupVideosByDate(videos)
  
  return Object.entries(groupedByDate).map(([date, dateVideos]) => ({
    Bin: {
      Name: `${date}`,
      UUID: generateUUID(),
      Items: dateVideos.map(video => ({
        ProjectItem: {
          Name: video.name,
          UUID: generateUUID(),
          Type: "Video",
          FilePath: video.name // Use just filename for local reference
        }
      }))
    }
  }))
}

function groupVideosByDate(videos: VideoFile[]): { [date: string]: VideoFile[] } {
  return videos.reduce((groups, video) => {
    const date = new Date(video.originalDate).toLocaleDateString()
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(video)
    return groups
  }, {} as { [date: string]: VideoFile[] })
}

function calculateTotalDuration(videos: VideoFile[]): number {
  return videos.reduce((total, video) => total + video.duration, 0)
}

function calculateClipStartTime(videos: VideoFile[], index: number): number {
  return videos.slice(0, index).reduce((total, video) => total + video.duration, 0)
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c == 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

async function createDownloadableFile(content: string, type: string): Promise<string> {
  try {
    // Use TextEncoder for better performance with large strings
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    
    // Use btoa with chunked processing to avoid stack overflow
    const base64 = btoa(String.fromCharCode.apply(null, Array.from(data)))
    
    const mimeType = type === 'capcut' ? 'application/json' : 'text/xml'
    
    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    console.error('Error creating downloadable file:', error)
    // Fallback: return the content as a simple data URL
    const mimeType = type === 'capcut' ? 'application/json' : 'text/xml'
    return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`
  }
}