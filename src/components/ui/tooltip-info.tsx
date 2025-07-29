import * as React from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipInfoProps {
  content: string;
  className?: string;
}

export const TooltipInfo: React.FC<TooltipInfoProps> = ({ content, className = "" }) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button 
            className={`relative w-6 h-6 rounded-full bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-2xl border border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all animate-pulse flex items-center justify-center ${className}`}
          >
            <Info className="w-3 h-3 text-white/80" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="glass border-white/20 bg-black/80 backdrop-blur-xl text-white/90">
          <p className="max-w-xs">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};