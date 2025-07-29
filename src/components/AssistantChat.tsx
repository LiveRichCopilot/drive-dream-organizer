import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  MessageCircle, 
  Send, 
  X, 
  Minimize2, 
  Maximize2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Bot,
  User
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AssistantChatProps {
  isOpen: boolean;
  onToggle: () => void;
  onAnalyticsEvent?: (event: string, data: any) => void;
}

const AssistantChat: React.FC<AssistantChatProps> = ({ 
  isOpen, 
  onToggle, 
  onAnalyticsEvent 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognition = useRef<any>(null);
  const synthesis = useRef<SpeechSynthesis | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = true;
      recognition.current.interimResults = true;
      recognition.current.lang = 'en-US';

      recognition.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        
        if (event.results[event.results.length - 1].isFinal) {
          setInput(transcript);
          setIsListening(false);
        }
      };

      recognition.current.onerror = () => {
        setIsListening(false);
        toast({
          title: "Voice recognition error",
          description: "Please try again",
          variant: "destructive"
        });
      };
    }

    // Initialize speech synthesis
    synthesis.current = window.speechSynthesis;

    return () => {
      if (recognition.current) {
        recognition.current.stop();
      }
      if (synthesis.current) {
        synthesis.current.cancel();
      }
    };
  }, [toast]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Send welcome message
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: "Hi! I'm your ODrive assistant. I can help you with photo organization, AI prompt extraction, and any questions about using the app. How can I assist you today?",
        timestamp: Date.now()
      }]);
    }
  }, [isOpen, messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Track analytics
    onAnalyticsEvent?.('assistant_message_sent', {
      message_length: userMessage.content.length,
      thread_id: threadId,
      timestamp: userMessage.timestamp
    });

    try {
      const { data, error } = await supabase.functions.invoke('openai-assistant-chat', {
        body: {
          message: userMessage.content,
          threadId,
          action: 'send_message'
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: data.messageId,
        role: 'assistant',
        content: data.message,
        timestamp: data.timestamp * 1000
      };

      setMessages(prev => [...prev, assistantMessage]);
      setThreadId(data.threadId);

      // Auto-speak assistant response if enabled
      if (synthesis.current && !synthesis.current.speaking) {
        const utterance = new SpeechSynthesisUtterance(data.message);
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        synthesis.current.speak(utterance);
      }

      // Track analytics
      onAnalyticsEvent?.('assistant_response_received', {
        response_length: data.message.length,
        thread_id: data.threadId,
        processing_time: Date.now() - userMessage.timestamp
      });

    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Message failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoiceRecognition = () => {
    if (!recognition.current) {
      toast({
        title: "Voice not supported",
        description: "Your browser doesn't support voice recognition",
        variant: "destructive"
      });
      return;
    }

    if (isListening) {
      recognition.current.stop();
      setIsListening(false);
    } else {
      recognition.current.start();
      setIsListening(true);
    }
  };

  const toggleSpeech = () => {
    if (!synthesis.current) return;

    if (isSpeaking) {
      synthesis.current.cancel();
      setIsSpeaking(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={onToggle}
          size="lg"
          variant="glow"
          className="rounded-full w-14 h-14 shadow-[0_0_30px_rgba(59,130,246,0.5)] animate-pulse"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Card className={`liquid-glass-card transition-all duration-300 ${
        isMinimized ? 'w-80 h-16' : 'w-96 h-[500px]'
      } bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/30 shadow-[0_0_40px_rgba(255,255,255,0.1)]`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-cyan-500/15 backdrop-blur-xl flex items-center justify-center border border-blue-400/40">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">ODrive Assistant</h3>
              <Badge variant="outline" className="text-xs bg-green-500/20 border-green-400/30 text-green-300">
                <Sparkles className="w-3 h-3 mr-1" />
                LiveRich AI
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="glass"
              size="sm"
              onClick={toggleSpeech}
              className={isSpeaking ? "bg-red-500/20" : ""}
            >
              {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="glass"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="glass"
              size="sm"
              onClick={onToggle}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto max-h-[340px] space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start gap-2 max-w-[80%] ${
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}>
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-xl flex items-center justify-center border border-white/30 flex-shrink-0">
                      {message.role === 'user' ? (
                        <User className="h-3 w-3 text-white" />
                      ) : (
                        <Bot className="h-3 w-3 text-white" />
                      )}
                    </div>
                    
                    <div className={`px-3 py-2 rounded-2xl text-sm ${
                      message.role === 'user'
                        ? 'bg-gradient-to-br from-blue-500/30 to-cyan-500/15 backdrop-blur-xl border border-blue-400/40 text-white'
                        : 'bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-xl border border-white/20 text-white/90'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-xl flex items-center justify-center border border-white/30">
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                    <div className="px-3 py-2 rounded-2xl bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-xl border border-white/20">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/20">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask about photo organization..."
                    className="bg-white/10 border-white/20 text-white placeholder-white/50 pr-12"
                    disabled={isLoading}
                  />
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={toggleVoiceRecognition}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 p-0 ${
                      isListening ? 'bg-red-500/20 animate-pulse' : ''
                    }`}
                  >
                    {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                  </Button>
                </div>
                
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  variant="glow"
                  size="sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default AssistantChat;