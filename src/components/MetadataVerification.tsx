import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, Info, MapPin, Camera, Monitor, FileVideo } from 'lucide-react';
import { VideoFile, apiClient } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface MetadataVerificationProps {
  videos: VideoFile[];
  onVerificationComplete: (verifiedVideos: VideoFile[], rejectedVideos: VideoFile[], results: VerificationResult[]) => void;
  onBack: () => void;
  initialResults?: VerificationResult[]; // Add prop to restore previous results
}

interface VerificationResult {
  video: VideoFile;
  status: 'pending' | 'success' | 'failed' | 'error';
  metadata?: any;
  originalDate?: string;
  error?: string;
}

const MetadataVerification: React.FC<MetadataVerificationProps> = ({
  videos,
  onVerificationComplete,
  onBack,
  initialResults
}) => {
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentVideo, setCurrentVideo] = useState<string>('');
  const [selectedMetadata, setSelectedMetadata] = useState<{video: VideoFile, metadata: any} | null>(null);

  useEffect(() => {
    // Initialize results - use previous results if available, otherwise start fresh
    if (initialResults && initialResults.length === videos.length) {
      setResults(initialResults);
    } else {
      setResults(videos.map(video => ({
        video,
        status: 'pending'
      })));
    }
  }, [videos, initialResults]);

  const startVerification = async (onlyFailed = false) => {
    setIsVerifying(true);
    setProgress(0);
    
    // Get videos to verify
    const videosToVerify = onlyFailed 
      ? videos.filter((video, index) => {
          const result = results[index];
          return result && (result.status === 'failed' || result.status === 'error');
        })
      : videos;
    
    if (onlyFailed && videosToVerify.length === 0) {
      toast({
        title: "No Failed Videos",
        description: "There are no failed videos to re-verify.",
        variant: "default"
      });
      setIsVerifying(false);
      return;
    }
    
    console.log(`${onlyFailed ? 'Re-verifying' : 'Verifying'} ${videosToVerify.length} videos...`);
    
    for (let i = 0; i < videosToVerify.length; i++) {
      const video = videosToVerify[i];
      setCurrentVideo(video.name);
      setProgress(((i) / videosToVerify.length) * 100);
      
      let newResult: VerificationResult;
      
      try {
        console.log(`Verifying metadata for ${video.name}...`);
        const metadata = await apiClient.extractVideoMetadata(video.id);
        
        // Check if we have a valid originalDate (not null, undefined, or empty string)
        if (metadata.originalDate && metadata.originalDate.trim() !== '') {
          newResult = {
            video,
            status: 'success',
            metadata,
            originalDate: metadata.originalDate
          };
          console.log(`✅ SUCCESS: ${video.name} has extractable metadata`);
        } else {
          newResult = {
            video,
            status: 'failed',
            metadata,
            error: 'No original shooting date found in metadata'
          };
          console.log(`❌ FAILED: ${video.name} has no extractable original date`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Check if it's an authentication error and provide clear guidance
        if (errorMessage.includes('authentication expired') || errorMessage.includes('re-authenticate') || 
            errorMessage.includes('Invalid Credentials') || errorMessage.includes('UNAUTHENTICATED')) {
          toast({
            title: "Google Drive Authentication Expired",
            description: "Please go back and click 'Authenticate with Google Drive' to get a fresh access token, then retry verification.",
            variant: "destructive"
          });
          setIsVerifying(false);
          return; // Stop the verification process
        }
        
        newResult = {
          video,
          status: 'error',
          error: errorMessage
        };
        console.log(`💥 ERROR: ${video.name} metadata extraction failed:`, error);
      }
      
      // Update results progressively
      setResults(prev => {
        const updated = [...prev];
        if (onlyFailed) {
          // For failed-only verification, update the specific video's result
          const originalIndex = videos.findIndex(v => v.id === video.id);
          if (originalIndex !== -1) {
            updated[originalIndex] = newResult;
          }
        } else {
          // For full verification, update normally
          updated[i] = newResult;
        }
        return updated;
      });
    }
    
    setProgress(100);
    setCurrentVideo('');
    setIsVerifying(false);
    
    // Count results from current state
    const currentResults = results.map((result, index) => {
      if (onlyFailed) {
        const video = videos[index];
        const wasUpdated = videosToVerify.some(v => v.id === video.id);
        return wasUpdated ? result : result; // Will be updated by setResults above
      }
      return result;
    });
    
    const successCount = currentResults.filter(r => r.status === 'success').length;
    const failedCount = currentResults.filter(r => r.status === 'failed').length;
    const errorCount = currentResults.filter(r => r.status === 'error').length;
    
    toast({
      title: "Metadata Verification Complete",
      description: onlyFailed 
        ? `Re-verified ${videosToVerify.length} failed videos` 
        : `${successCount} videos have extractable metadata, ${failedCount + errorCount} do not.`,
      variant: successCount > 0 ? "default" : "destructive"
    });
  };

  const startFailedVerification = () => startVerification(true);
  const startFullVerification = () => startVerification(false);

  const proceedWithVerified = () => {
    const verifiedVideos = results
      .filter(r => r.status === 'success')
      .map(r => r.video);
    
    const rejectedVideos = results
      .filter(r => r.status === 'failed' || r.status === 'error')
      .map(r => r.video);
    
    if (verifiedVideos.length === 0) {
      toast({
        title: "No Videos to Process",
        description: "No videos have extractable metadata. Please check your files or try a different approach.",
        variant: "destructive"
      });
      return;
    }
    
    onVerificationComplete(verifiedVideos, rejectedVideos, results);
  };

  const getStatusIcon = (status: VerificationResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: VerificationResult['status'], result?: VerificationResult) => {
    switch (status) {
      case 'success':
        return (
          <Badge 
            variant="default" 
            className="bg-green-500 cursor-pointer hover:bg-green-600 transition-colors"
            onClick={() => result && setSelectedMetadata({video: result.video, metadata: result.metadata})}
          >
            Has Metadata
          </Badge>
        );
      case 'failed':
        return <Badge variant="destructive">No Original Date</Badge>;
      case 'error':
        return <Badge variant="secondary">Extraction Error</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const pendingCount = results.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Metadata Verification</h2>
          <p className="text-muted-foreground">
            Let's check which videos have extractable original shooting dates before processing
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          Back to Processing
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Verification Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress */}
          {isVerifying && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Verifying: {currentVideo}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{successCount}</div>
              <div className="text-sm text-muted-foreground">Has Metadata</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{failedCount}</div>
              <div className="text-sm text-muted-foreground">No Original Date</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-500">{errorCount}</div>
              <div className="text-sm text-muted-foreground">Extraction Error</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">{pendingCount}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!isVerifying && results.every(r => r.status === 'pending') && (
              <Button onClick={startFullVerification} className="flex-1">
                Start Metadata Verification
              </Button>
            )}
            
            {!isVerifying && successCount > 0 && (
              <Button onClick={proceedWithVerified} className="flex-1">
                Process {successCount} Videos with Metadata
              </Button>
            )}
            
            {!isVerifying && !results.every(r => r.status === 'pending') && (
              <>
                <Button variant="outline" onClick={startFullVerification}>
                  Re-verify All
                </Button>
                {(failedCount > 0 || errorCount > 0) && (
                  <Button variant="secondary" onClick={startFailedVerification}>
                    Re-verify Failed Only ({failedCount + errorCount})
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Results */}
      <Card>
        <CardHeader>
          <CardTitle>Video Details ({videos.length} total)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={result.video.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getStatusIcon(result.status)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{result.video.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {result.video.sizeFormatted} • {result.video.duration}
                      {result.originalDate && (
                        <span className="ml-2 text-green-600">
                          📅 {new Date(result.originalDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {result.error && (
                      <div className="text-sm text-red-500 mt-1">{result.error}</div>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {getStatusBadge(result.status, result)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Metadata Popup Modal */}
      {selectedMetadata && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
          onClick={() => setSelectedMetadata(null)}
        >
          <div 
            className="relative w-full max-w-md mx-auto glass-card border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">Info</h3>
                <button 
                  onClick={() => setSelectedMetadata(null)}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                <h4 className="text-white font-medium">{selectedMetadata.video.name}</h4>
                <p className="text-white/70 text-sm">
                  {selectedMetadata.metadata?.originalDate ? 
                    new Date(selectedMetadata.metadata.originalDate).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'long', 
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      second: '2-digit'
                    }) : 
                    'Date not available'
                  }
                </p>
              </div>
            </div>

            {/* Metadata Details */}
            <div className="p-6 space-y-4">
              {/* Device Info */}
              {selectedMetadata.metadata?.deviceInfo && (
                <div className="flex items-start gap-3">
                  <Camera className="h-5 w-5 text-white/60 mt-0.5" />
                  <div>
                    <p className="text-white text-sm">{selectedMetadata.metadata.deviceInfo}</p>
                    <p className="text-white/60 text-xs">Camera</p>
                  </div>
                </div>
              )}

              {/* Video Specs */}
              <div className="bg-white/5 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-white/60" />
                       <span className="text-white text-sm">
                         {selectedMetadata.metadata?.videoMetadata?.width && selectedMetadata.metadata?.videoMetadata?.height 
                           ? `${selectedMetadata.metadata.videoMetadata.width}×${selectedMetadata.metadata.videoMetadata.height}`
                           : selectedMetadata.metadata?.resolution || 
                             'Unknown'}
                       </span>
                    </div>
                    <p className="text-white/60 text-xs">Resolution</p>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileVideo className="h-4 w-4 text-white/60" />
                      <span className="text-white text-sm">
                        {selectedMetadata.video.sizeFormatted}
                      </span>
                    </div>
                    <p className="text-white/60 text-xs">File Size</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-white text-sm">
                      {selectedMetadata.metadata?.videoMetadata?.codec || 'H.264'}
                    </span>
                    <p className="text-white/60 text-xs">Codec</p>
                  </div>
                  
                  <div className="space-y-1">
                    <span className="text-white text-sm">
                      {selectedMetadata.metadata?.videoMetadata?.fps || '30'} FPS
                    </span>
                    <p className="text-white/60 text-xs">Frame Rate</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-white text-sm">
                    {selectedMetadata.video.duration}
                  </span>
                  <p className="text-white/60 text-xs">Duration</p>
                </div>
              </div>

              {/* Location if available */}
              {selectedMetadata.metadata?.gpsCoordinates && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-white/60" />
                    <span className="text-white text-sm">
                      {selectedMetadata.metadata.locationInfo || 
                       `${selectedMetadata.metadata.gpsCoordinates.latitude.toFixed(4)}, ${selectedMetadata.metadata.gpsCoordinates.longitude.toFixed(4)}`}
                    </span>
                  </div>
                  <div className="bg-blue-500/20 rounded-lg h-24 flex items-center justify-center relative overflow-hidden">
                    {selectedMetadata.metadata.gpsCoordinates ? (
                      <div className="text-center">
                        <MapPin className="h-6 w-6 text-blue-400 mx-auto mb-1" />
                        <div className="text-xs text-blue-300">
                          {selectedMetadata.metadata.gpsCoordinates.latitude.toFixed(4)}°, {selectedMetadata.metadata.gpsCoordinates.longitude.toFixed(4)}°
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <MapPin className="h-6 w-6 text-blue-400 mx-auto mb-1" />
                        <div className="text-xs text-blue-300">Location</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Original Date Info */}
              {selectedMetadata.metadata?.originalDate && (
                <div className="text-xs text-white/60 bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                  <Info className="h-3 w-3 inline mr-1" />
                  Original shooting date successfully extracted from video metadata
                  {selectedMetadata.metadata?.inferredFromSequence && (
                    <span className="ml-1 text-yellow-300">(inferred from sequence)</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetadataVerification;