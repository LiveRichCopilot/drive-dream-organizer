import React, { useState, useRef } from 'react';
import { Mic, MicOff, MessageCircle, X, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// Type declarations for Speech Recognition API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface VoiceAssistantProps {
  className?: string;
}

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Knowledge base for the assistant
  const knowledgeBase = {
    "google drive": "To connect Google Drive, click the 'Connect to Google Drive' button on the main page. You'll need to authorize the app to access your Drive files. Make sure you have videos in your selected folder.",
    "photos not showing": "If photos aren't showing, check: 1) You're connected to Google Drive, 2) The selected folder contains video files, 3) Your internet connection is stable, 4) Try refreshing the page or reconnecting to Google Drive.",
    "ai system": "Our multi-agent AI system uses several specialized agents: metadata extraction for video dates, content analysis for organizing files, and export generation for video editing software. Each agent handles specific tasks to ensure accurate results.",
    "metadata extraction": "The system extracts original shooting dates from video metadata, even from edited files. It handles iPhone, Android, and camera videos, and can recover dates lost during editing in software like CapCut or Premiere Pro.",
    "troubleshooting": "Common issues: 1) Connection problems - try disconnecting and reconnecting Google Drive, 2) No videos showing - check folder permissions, 3) Slow processing - large files take more time, 4) Export errors - ensure you have proper permissions.",
    "organizing videos": "Videos are organized by original shooting date, location, and content type. The system can detect events, group related videos, and suggest folder structures based on your content patterns.",
    "export formats": "You can export organized videos to various formats including CapCut projects, Premiere Pro sequences, and custom folder structures. Each export maintains the original metadata and organization.",
    "video processing": "Video processing includes metadata extraction, content analysis, duplicate detection, and smart organization. The system handles large files efficiently and provides progress updates."
  };

  const getResponse = (question: string): string => {
    const lowerQuestion = question.toLowerCase();
    
    for (const [key, answer] of Object.entries(knowledgeBase)) {
      if (lowerQuestion.includes(key)) {
        return answer;
      }
    }
    
    // Default response for unmatched questions
    return "I'm here to help with Google Drive connections, video organization, metadata extraction, and troubleshooting. You can ask me about connecting your Drive, why photos might not be showing, how our AI system works, or any technical issues you're experiencing.";
  };

  const speakText = async (text: string) => {
    try {
      setIsSpeaking(true);
      
      // Using Web Speech API for text-to-speech as a fallback
      // In production, you would integrate with ElevenLabs API
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 0.8;
        
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        
        speechSynthesis.speak(utterance);
      } else {
        // Fallback: just show the text
        setIsSpeaking(false);
        toast({
          title: "Voice Assistant",
          description: text,
        });
      }
    } catch (error) {
      console.error('Error speaking text:', error);
      setIsSpeaking(false);
      toast({
        title: "Voice Assistant",
        description: text,
        variant: "default",
      });
    }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in this browser.",
        variant: "destructive",
      });
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setTranscript('');
      };

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setTranscript(finalTranscript);
          processQuestion(finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        toast({
          title: "Recognition Error",
          description: "Could not recognize speech. Please try again.",
          variant: "destructive",
        });
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const processQuestion = async (question: string) => {
    setIsLoading(true);
    
    try {
      const answer = getResponse(question);
      setResponse(answer);
      await speakText(answer);
    } catch (error) {
      console.error('Error processing question:', error);
      toast({
        title: "Error",
        description: "Failed to process your question.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  return (
    <>
      {/* Floating Help Button */}
      <div className={cn("fixed bottom-6 right-6 z-50", className)}>
        {!isOpen && (
          <Button
            onClick={() => setIsOpen(true)}
            className="h-14 w-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 shadow-lg"
            size="icon"
          >
            <MessageCircle className="h-6 w-6 text-white" />
          </Button>
        )}
      </div>

      {/* Voice Assistant Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-80 max-h-96">
          <div className="bg-white/10 backdrop-blur-[20px] backdrop-saturate-[180%] p-6 border border-white/30 rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Voice Assistant</h3>
              <Button
                onClick={() => setIsOpen(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/70 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Status */}
            <div className="mb-4">
              {isListening && (
                <div className="flex items-center gap-2 text-accent">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                  <span className="text-sm">Listening...</span>
                </div>
              )}
              {isSpeaking && (
                <div className="flex items-center gap-2 text-secondary">
                  <Volume2 className="h-4 w-4" />
                  <span className="text-sm">Speaking...</span>
                </div>
              )}
              {isLoading && (
                <div className="flex items-center gap-2 text-white/70">
                  <div className="w-2 h-2 bg-white/70 rounded-full animate-pulse" />
                  <span className="text-sm">Processing...</span>
                </div>
              )}
            </div>

            {/* Transcript */}
            {transcript && (
              <div className="mb-4 p-3 glass rounded-lg">
                <p className="text-sm text-white/90">You: {transcript}</p>
              </div>
            )}

            {/* Response */}
            {response && (
              <div className="mb-4 p-3 glass rounded-lg">
                <p className="text-sm text-white/90">{response}</p>
              </div>
            )}

            {/* Controls */}
            <div className="flex gap-2 justify-center">
              {!isListening ? (
                <Button
                  onClick={startListening}
                  className="flex items-center gap-2 bg-accent/20 hover:bg-accent/30 text-white border border-accent/30"
                  disabled={isSpeaking || isLoading}
                >
                  <Mic className="h-4 w-4" />
                  Ask Question
                </Button>
              ) : (
                <Button
                  onClick={stopListening}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <MicOff className="h-4 w-4" />
                  Stop
                </Button>
              )}
              
              {isSpeaking && (
                <Button
                  onClick={stopSpeaking}
                  variant="outline"
                  size="icon"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <VolumeX className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Help Text */}
            <div className="mt-4 text-xs text-white/60 text-center">
              Ask me about connecting Google Drive, organizing videos, or troubleshooting issues.
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VoiceAssistant;