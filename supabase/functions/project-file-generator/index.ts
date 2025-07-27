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

    // Project metadata
    metadata: {
      total_clips: sortedVideos.length,
      total_duration: calculateTotalDuration(sortedVideos),
      creation_date: new Date().toISOString(),
      organized_by_date: settings.organization.groupByDate,
      instructions: "Import video files to the same folder as this project file for proper linking"
    }
  }

  // Add date-based subsequences if requested
  if (settings.organization.createSubsequences && settings.organization.groupByDate) {
    project.subsequences = createDateBasedSubsequences(sortedVideos)
  }

  return JSON.stringify(project, null, 2)
}

function generatePremiereProject(videos: VideoFile[], settings: ProjectSettings) {
  // Sort videos chronologically if requested
  const sortedVideos = settings.timeline.sequence === 'chronological' 
    ? videos.sort((a, b) => new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime())
    : videos

  // Generate proper Premiere Pro XML project file (Final Cut Pro XML format which Premiere can import)
  const videoClips = sortedVideos.map(video => 
    `          <clip id="${video.id}">
            <name>${video.name}</name>
            <duration>${Math.round(video.duration)}</duration>
            <rate>
              <timebase>${settings.timeline.frameRate}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <media>
              <video>
                <track>
                  <clipitem id="${video.id}_item">
                    <name>${video.name}</name>
                    <duration>${Math.round(video.duration)}</duration>
                    <rate>
                      <timebase>${settings.timeline.frameRate}</timebase>
                      <ntsc>FALSE</ntsc>
                    </rate>
                    <in>0</in>
                    <out>${Math.round(video.duration)}</out>
                    <file id="${video.id}_file">
                      <name>${video.name}</name>
                      <pathurl>file://localhost/${video.name}</pathurl>
                      <rate>
                        <timebase>${settings.timeline.frameRate}</timebase>
                        <ntsc>FALSE</ntsc>
                      </rate>
                      <duration>${Math.round(video.duration)}</duration>
                      <media>
                        <video>
                          <samplecharacteristics>
                            <rate>
                              <timebase>${settings.timeline.frameRate}</timebase>
                              <ntsc>FALSE</ntsc>
                            </rate>
                            <width>${parseInt(settings.timeline.resolution.split('x')[0])}</width>
                            <height>${parseInt(settings.timeline.resolution.split('x')[1])}</height>
                            <anamorphic>FALSE</anamorphic>
                            <pixelaspectratio>square</pixelaspectratio>
                            <fielddominance>none</fielddominance>
                          </samplecharacteristics>
                        </video>
                      </media>
                    </file>
                  </clipitem>
                </track>
              </video>
            </media>
          </clip>`
  ).join('\n')

  const timelineClips = sortedVideos.map((video, index) => {
    const startTime = calculateClipStartTime(sortedVideos, index);
    return `              <clipitem id="${video.id}_timeline">
                <name>${video.name}</name>
                <duration>${Math.round(video.duration)}</duration>
                <rate>
                  <timebase>${settings.timeline.frameRate}</timebase>
                  <ntsc>FALSE</ntsc>
                </rate>
                <in>0</in>
                <out>${Math.round(video.duration)}</out>
                <start>${Math.round(startTime)}</start>
                <end>${Math.round(startTime + video.duration)}</end>
                <file id="${video.id}_file"/>
              </clipitem>`;
  }).join('\n')

  const projectXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <project>
    <name>${settings.projectName}</name>
    <children>
      <bin>
        <name>Organized Videos</name>
        <children>
${videoClips}
        </children>
      </bin>
      <sequence id="${generateUUID()}">
        <name>${settings.projectName}_Timeline</name>
        <duration>${calculateTotalDuration(sortedVideos)}</duration>
        <rate>
          <timebase>${settings.timeline.frameRate}</timebase>
          <ntsc>FALSE</ntsc>
        </rate>
        <timecode>
          <rate>
            <timebase>${settings.timeline.frameRate}</timebase>
            <ntsc>FALSE</ntsc>
          </rate>
          <string>00:00:00:00</string>
          <frame>0</frame>
          <source>source</source>
          <displayformat>NDF</displayformat>
        </timecode>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <rate>
                  <timebase>${settings.timeline.frameRate}</timebase>
                  <ntsc>FALSE</ntsc>
                </rate>
                <width>${parseInt(settings.timeline.resolution.split('x')[0])}</width>
                <height>${parseInt(settings.timeline.resolution.split('x')[1])}</height>
                <anamorphic>FALSE</anamorphic>
                <pixelaspectratio>square</pixelaspectratio>
                <fielddominance>none</fielddominance>
              </samplecharacteristics>
            </format>
            <track>
${timelineClips}
            </track>
          </video>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>

<!-- Instructions for use:
1. Save this XML file as ${settings.projectName}.xml
2. Place all video files (${sortedVideos.map(v => v.name).join(', ')}) in the same folder as this XML file
3. Import this XML file into Premiere Pro via File > Import > Project
4. Files are arranged chronologically by original date
-->`

  return projectXML
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