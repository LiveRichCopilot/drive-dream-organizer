// Test script for the new edge functions
import { apiClient } from '@/lib/api';

async function testEdgeFunctions() {
  console.log('🧪 Testing new edge functions...');
  
  // Test 1: Video Metadata Extractor
  console.log('\n📊 Testing video metadata extractor...');
  try {
    const sampleVideoId = '1OM-UaZvd5ZDjOwmeGrUM1mPDO7X2owwX'; // From the logs
    const metadata = await apiClient.extractVideoMetadata(sampleVideoId);
    console.log('✅ Metadata extraction successful:', metadata);
  } catch (error) {
    console.error('❌ Metadata extraction failed:', error);
  }

  // Test 2: Project File Generator  
  console.log('\n🎬 Testing project file generator...');
  try {
    const sampleVideos = [
      {
        id: '1OM-UaZvd5ZDjOwmeGrUM1mPDO7X2owwX',
        name: 'IMG_7812.MOV',
        path: '/downloads/IMG_7812.MOV',
        duration: 6099,
        resolution: '2160x3840',
        fps: 30,
        originalDate: '2025-07-10T06:01:36.933Z',
        metadata: {}
      }
    ];
    
    const settings = {
      projectName: 'Test_Video_Project',
      outputFormat: 'both',
      timeline: {
        frameRate: 30,
        resolution: '1920x1080',
        sequence: 'chronological'
      },
      organization: {
        groupByDate: true,
        createSubsequences: false
      }
    };
    
    const projectResult = await apiClient.generateProjectFiles(sampleVideos, settings);
    console.log('✅ Project generation successful:', projectResult);
  } catch (error) {
    console.error('❌ Project generation failed:', error);
  }

  console.log('\n🎯 Edge function tests completed!');
}

// Export for testing in console
(window as any).testEdgeFunctions = testEdgeFunctions;

export default testEdgeFunctions;