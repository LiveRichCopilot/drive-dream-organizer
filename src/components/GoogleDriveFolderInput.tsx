import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { FolderOpen, Check, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GoogleDriveFolderInputProps {
  onFolderSelected?: (folderId: string) => void;
}

const GoogleDriveFolderInput = ({ onFolderSelected }: GoogleDriveFolderInputProps) => {
  const [folderUrl, setFolderUrl] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const extractFolderIdFromUrl = (url: string): string | null => {
    // Match Google Drive folder URLs
    const patterns = [
      /\/folders\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
      /^([a-zA-Z0-9-_]+)$/ // Direct folder ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  };

  const validateFolder = async (url: string) => {
    if (!url.trim()) {
      setIsValid(null);
      return;
    }

    setIsValidating(true);
    
    try {
      const folderId = extractFolderIdFromUrl(url);
      
      if (!folderId) {
        setIsValid(false);
        toast({
          title: "Invalid URL",
          description: "Please enter a valid Google Drive folder URL or ID",
          variant: "destructive",
        });
        return;
      }

      setIsValid(true);
      onFolderSelected?.(folderId);
      
      toast({
        title: "Folder Selected",
        description: "Google Drive folder has been configured",
      });
    } catch (error) {
      console.error('Folder validation failed:', error);
      setIsValid(false);
      toast({
        title: "Validation Failed",
        description: "Could not validate the folder. Please check the URL and try again.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateFolder(folderUrl);
  };

  return (
    <div className="bg-white/5 backdrop-blur-[20px] backdrop-saturate-[180%] p-6 border border-white/20 rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] space-y-4">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Specify Google Drive Folder</h3>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Enter a Google Drive folder URL or ID to organize videos from a specific folder.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="folder-url">Google Drive Folder URL or ID</Label>
          <div className="relative">
            <Input
              id="folder-url"
              type="text"
              placeholder="https://drive.google.com/drive/folders/your-folder-id or just the folder ID"
              value={folderUrl}
              onChange={(e) => {
                setFolderUrl(e.target.value);
                setIsValid(null);
              }}
              className={`pr-10 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white placeholder-white/50 ${
                isValid === true ? 'border-green-400/50' : 
                isValid === false ? 'border-red-400/50' : ''
              }`}
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              {isValidating && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              )}
              {!isValidating && isValid === true && (
                <Check className="h-4 w-4 text-green-500" />
              )}
              {!isValidating && isValid === false && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
        </div>

        <Button 
          type="submit" 
          disabled={!folderUrl.trim() || isValidating}
          variant="glass"
          size="sm"
          className="ml-auto"
        >
          {isValidating ? "Validating..." : "Set Folder"}
        </Button>
      </form>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Supported formats:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>Full URL: https://drive.google.com/drive/folders/1ABC...</li>
          <li>Folder ID only: 1ABC2DEF3GHI...</li>
        </ul>
      </div>
    </div>
  );
};

export default GoogleDriveFolderInput;