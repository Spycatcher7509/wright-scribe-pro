import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Upload, FileAudio, Loader2, Youtube } from "lucide-react";

interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
  logId?: string;
  title?: string;
}

export function TranscriptionUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [downloadVideo, setDownloadVideo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TranscriptionResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file size (max 25MB for Whisper API)
      if (selectedFile.size > 25 * 1024 * 1024) {
        toast.error("File size must be less than 25MB");
        return;
      }
      
      // Check file type
      const allowedTypes = [
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", 
        "audio/webm", "audio/ogg", "video/mp4", "video/webm"
      ];
      if (!allowedTypes.includes(selectedFile.type)) {
        toast.error("Unsupported file format. Please use MP3, WAV, M4A, WEBM, OGG, or MP4");
        return;
      }

      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleTranscribe = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in to transcribe files");
        return;
      }

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", file.name);

      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setResult({
        text: data.text,
        duration: data.duration,
        language: data.language,
        logId: data.logId,
      });

      toast.success("Transcription completed successfully!");
    } catch (error: any) {
      console.error("Transcription error:", error);
      toast.error(error.message || "Failed to transcribe audio");
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleYoutubeTranscribe = async () => {
    if (!youtubeUrl.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in to transcribe videos");
        return;
      }

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const { data, error } = await supabase.functions.invoke("transcribe-youtube", {
        body: { youtubeUrl, downloadVideo },
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setResult({
        text: data.text,
        duration: data.duration,
        language: data.language,
        logId: data.logId,
        title: data.title,
      });

      toast.success("YouTube transcription completed successfully!");
    } catch (error: any) {
      console.error("YouTube transcription error:", error);
      toast.error(error.message || "Failed to transcribe YouTube video");
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleReset = () => {
    setFile(null);
    setYoutubeUrl("");
    setResult(null);
    setProgress(0);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Transcribe Audio</CardTitle>
          <CardDescription>
            Upload a file or paste a YouTube URL to transcribe
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="file" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file">Upload File</TabsTrigger>
              <TabsTrigger value="youtube">YouTube URL</TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="audio-file">Select File (Max 25MB)</Label>
                <div className="flex gap-2">
                  <Input
                    id="audio-file"
                    type="file"
                    accept="audio/*,video/mp4,video/webm"
                    onChange={handleFileChange}
                    disabled={isProcessing}
                  />
                  {file && (
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={isProcessing}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {file && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <FileAudio className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              )}

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Processing transcription...</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              <Button
                onClick={handleTranscribe}
                disabled={!file || isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Transcribing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Transcribe Audio
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="youtube" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="youtube-url">YouTube URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="youtube-url"
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    disabled={isProcessing}
                  />
                  {youtubeUrl && (
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={isProcessing}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste a YouTube video URL to extract and transcribe the audio
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="download-video" 
                  checked={downloadVideo}
                  onCheckedChange={(checked) => setDownloadVideo(checked as boolean)}
                  disabled={isProcessing}
                />
                <Label 
                  htmlFor="download-video" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Download video file
                </Label>
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Downloading and transcribing...</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              <Button
                onClick={handleYoutubeTranscribe}
                disabled={!youtubeUrl.trim() || isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Youtube className="mr-2 h-4 w-4" />
                    Transcribe YouTube Video
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Transcription Result</CardTitle>
            {result.title && (
              <CardDescription className="font-medium">{result.title}</CardDescription>
            )}
            {result.duration && (
              <CardDescription>
                Duration: {Math.round(result.duration)}s | Language: {result.language || "Unknown"}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-muted rounded-md">
              <p className="text-sm whitespace-pre-wrap">{result.text}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(result.text);
                  toast.success("Copied to clipboard!");
                }}
              >
                Copy Text
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([result.text], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `transcription-${new Date().getTime()}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Downloaded transcription!");
                }}
              >
                Download as TXT
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
