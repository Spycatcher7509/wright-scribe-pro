import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Upload, FileAudio, Loader2, Youtube, AlertTriangle, Shield, Eye, History, CheckCircle2, XCircle } from "lucide-react";
import { calculateFileChecksum } from "@/lib/checksumUtils";
import { format } from "date-fns";

interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
  logId?: string;
  title?: string;
}

export function TranscriptionUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [fileChecksum, setFileChecksum] = useState<string>("");
  const [duplicateWarning, setDuplicateWarning] = useState<{ 
    exists: boolean; 
    logs?: any[];
    totalVersions?: number;
  } | null>(null);
  const [proceedWithDuplicate, setProceedWithDuplicate] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [downloadVideo, setDownloadVideo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [mode, setMode] = useState<'transcribe' | 'translate'>('transcribe');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setDuplicateWarning(null);
      setProceedWithDuplicate(false);
      setIsValidating(true);

      // Calculate checksum
      try {
        toast.info("Validating file integrity...");
        const checksum = await calculateFileChecksum(selectedFile);
        setFileChecksum(checksum);

        // Check if file already exists
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: existingLogs, error: fetchError } = await supabase
            .from('transcription_logs')
            .select('*')
            .eq('file_checksum', checksum)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (fetchError) {
            console.error("Error checking for duplicates:", fetchError);
            toast.error("Failed to check for duplicates");
          } else if (existingLogs && existingLogs.length > 0) {
            const completedLogs = existingLogs.filter(log => log.status === 'completed');
            setDuplicateWarning({
              exists: true,
              logs: existingLogs,
              totalVersions: existingLogs.length
            });
            
            if (completedLogs.length > 0) {
              toast.warning(
                `Duplicate detected! This file has ${existingLogs.length} existing version${existingLogs.length !== 1 ? 's' : ''}`,
                {
                  duration: 5000,
                }
              );
            } else {
              toast.warning(
                `File previously uploaded but processing failed. You can try again.`,
                {
                  duration: 4000,
                }
              );
            }
          } else {
            setFileChecksum(checksum);
            toast.success("File validated - no duplicates found", {
              icon: <Shield className="h-4 w-4" />,
            });
          }
        }
      } catch (error) {
        console.error("Error calculating checksum:", error);
        toast.error("Failed to calculate file checksum");
      } finally {
        setIsValidating(false);
      }
    }
  };

  const handleTranscribe = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    // Check if duplicate exists and user hasn't acknowledged
    if (duplicateWarning?.exists && !proceedWithDuplicate) {
      const hasCompleted = duplicateWarning.logs?.some(log => log.status === 'completed');
      if (hasCompleted) {
        toast.error("Please acknowledge the duplicate warning before proceeding");
        return;
      }
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
      formData.append("fileChecksum", fileChecksum);

      const functionName = mode === 'translate' ? 'translate-audio' : 'transcribe-audio';
      const { data, error } = await supabase.functions.invoke(functionName, {
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

      const successMessage = mode === 'translate' 
        ? 'Translation completed successfully!' 
        : 'Transcription completed successfully!';
      toast.success(successMessage);
    } catch (error: any) {
      console.error('Processing error:', error);
      const errorMessage = mode === 'translate' 
        ? 'Failed to translate audio' 
        : 'Failed to transcribe audio';
      toast.error(error.message || errorMessage);
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
    setFileChecksum("");
    setDuplicateWarning(null);
    setProceedWithDuplicate(false);
    setYoutubeUrl("");
    setResult(null);
    setProgress(0);
    setMode('transcribe');
  };

  const handleUseCachedResult = (log: any) => {
    if (log.transcription_text) {
      setResult({
        text: log.transcription_text,
        logId: log.id,
        language: 'cached'
      });
      toast.success("Loaded cached transcription result");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Transcribe or Translate Audio</CardTitle>
          <CardDescription>
            Upload a file or paste a YouTube URL to transcribe or translate to English
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
                <>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <FileAudio className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                {isValidating && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertDescription>
                      Validating file and checking for duplicates...
                    </AlertDescription>
                  </Alert>
                )}

                {duplicateWarning?.exists && !isValidating && (
                  <Alert variant="destructive" className="border-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-3">
                        <div>
                          <strong className="text-base">⚠️ Duplicate File Detected</strong>
                          <p className="text-sm mt-1">
                            This file has been processed <strong>{duplicateWarning.totalVersions}</strong> time{duplicateWarning.totalVersions !== 1 ? 's' : ''} before.
                          </p>
                        </div>

                        {duplicateWarning.logs && duplicateWarning.logs.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Previous Versions:</p>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {duplicateWarning.logs.slice(0, 3).map((log, index) => (
                                <div key={log.id} className="bg-background/50 p-2 rounded-md text-xs space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">
                                      Version {duplicateWarning.totalVersions! - index}
                                      {index === 0 && " (Latest)"}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {log.status === 'completed' && (
                                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                                      )}
                                      {log.status === 'failed' && (
                                        <XCircle className="h-3 w-3 text-red-600" />
                                      )}
                                      <span className="capitalize">{log.status}</span>
                                    </div>
                                  </div>
                                  <div className="text-muted-foreground">
                                    {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}
                                  </div>
                                  {log.status === 'completed' && log.transcription_text && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-xs mt-1"
                                      onClick={() => handleUseCachedResult(log)}
                                    >
                                      <Eye className="h-3 w-3 mr-1" />
                                      Use This Result
                                    </Button>
                                  )}
                                </div>
                              ))}
                              {duplicateWarning.totalVersions! > 3 && (
                                <p className="text-xs text-muted-foreground text-center">
                                  + {duplicateWarning.totalVersions! - 3} more version{duplicateWarning.totalVersions! - 3 !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {duplicateWarning.logs?.some(log => log.status === 'completed') && (
                          <div className="space-y-2 pt-2 border-t">
                            <p className="text-sm font-medium">Options:</p>
                            <div className="flex items-start gap-2">
                              <Checkbox
                                id="proceed-duplicate"
                                checked={proceedWithDuplicate}
                                onCheckedChange={(checked) => setProceedWithDuplicate(checked as boolean)}
                              />
                              <div className="grid gap-1.5 leading-none">
                                <label
                                  htmlFor="proceed-duplicate"
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  I understand this is a duplicate and want to process it anyway
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  This will create another version and consume API credits
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs">
                          <Shield className="h-3 w-3" />
                          <span className="text-muted-foreground">
                            Checksum: <code className="bg-background px-1 py-0.5 rounded">{fileChecksum.substring(0, 16)}...</code>
                          </span>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label>Mode</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={mode === 'transcribe' ? 'default' : 'outline'}
                      onClick={() => setMode('transcribe')}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      Transcribe
                    </Button>
                    <Button
                      type="button"
                      variant={mode === 'translate' ? 'default' : 'outline'}
                      onClick={() => setMode('translate')}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      Translate to English
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mode === 'transcribe' 
                      ? 'Keep the original language' 
                      : 'Translate any language to English'}
                  </p>
                </div>
              </>
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
                disabled={
                  !file || 
                  isProcessing || 
                  isValidating ||
                  (duplicateWarning?.exists && 
                   duplicateWarning.logs?.some(log => log.status === 'completed') && 
                   !proceedWithDuplicate)
                }
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'translate' ? 'Translating...' : 'Transcribing...'}
                  </>
                ) : isValidating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {duplicateWarning?.exists && proceedWithDuplicate && (
                      <History className="mr-2 h-4 w-4" />
                    )}
                    {mode === 'translate' ? 'Translate Audio' : 'Transcribe Audio'}
                    {duplicateWarning?.exists && proceedWithDuplicate && ' (New Version)'}
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
            <CardTitle>
              {mode === 'translate' ? 'Translation Result' : 'Transcription Result'}
            </CardTitle>
            {result.title && (
              <CardDescription className="font-medium">{result.title}</CardDescription>
            )}
            {result.duration && (
              <CardDescription>
                Duration: {Math.round(result.duration)}s | Language: {result.language || "Unknown"}
                {mode === 'translate' && ' (translated to English)'}
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
