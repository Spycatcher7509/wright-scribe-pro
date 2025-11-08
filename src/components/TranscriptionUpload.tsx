import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Upload, FileAudio, Loader2, Youtube, AlertTriangle, Shield, Eye, History, CheckCircle2, XCircle, Subtitles, AlertCircle } from "lucide-react";
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
  const [captionStatus, setCaptionStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    languages?: Array<{ code: string; name: string }>;
    message?: string;
  }>({ checking: false, available: null });
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

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

  const getLanguageName = (code: string): string => {
    const languageNames: { [key: string]: string } = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese (Simplified)',
      'zh-Hans': 'Chinese (Simplified)',
      'zh-Hant': 'Chinese (Traditional)',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'pl': 'Polish',
      'tr': 'Turkish',
      'sv': 'Swedish',
      'da': 'Danish',
      'fi': 'Finnish',
      'no': 'Norwegian',
      'cs': 'Czech',
      'el': 'Greek',
      'he': 'Hebrew',
      'id': 'Indonesian',
      'th': 'Thai',
      'vi': 'Vietnamese',
      'uk': 'Ukrainian',
      'ro': 'Romanian',
      'hu': 'Hungarian',
      'bg': 'Bulgarian',
    };
    return languageNames[code] || code.toUpperCase();
  };

  const checkCaptionAvailability = async (url: string) => {
    // Extract video ID from URL
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (!videoIdMatch) {
      setCaptionStatus({ checking: false, available: null, message: "Invalid YouTube URL" });
      return;
    }

    const videoId = videoIdMatch[1];
    setCaptionStatus({ checking: true, available: null });

    try {
      // First verify the video exists
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      
      if (!response.ok) {
        setCaptionStatus({ 
          checking: false, 
          available: false, 
          message: "Could not verify video - it may be private or unavailable" 
        });
        return;
      }

      // Fetch the video page to extract all available caption tracks
      const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
      
      if (!videoPageResponse.ok) {
        setCaptionStatus({ 
          checking: false, 
          available: null,
          message: "Unable to check caption availability" 
        });
        return;
      }

      const html = await videoPageResponse.text();
      
      // Extract caption tracks from the page
      const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
      
      if (!captionTracksMatch) {
        // No captions found in video page, try the API as fallback
        const captionCheckResponse = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`);
        
        if (captionCheckResponse.ok) {
          const text = await captionCheckResponse.text();
          if (text && text.trim().length > 0 && text.includes('<text')) {
            setCaptionStatus({ 
              checking: false, 
              available: true, 
              languages: [{ code: 'en', name: 'English' }],
              message: "English captions available" 
            });
            setSelectedLanguage('en');
            return;
          }
        }

        setCaptionStatus({ 
          checking: false, 
          available: false,
          message: "No captions detected - this video may not be supported" 
        });
        return;
      }

      try {
        const captionTracks = JSON.parse(captionTracksMatch[1]);
        
        if (!captionTracks || captionTracks.length === 0) {
          setCaptionStatus({ 
            checking: false, 
            available: false,
            message: "No captions found for this video" 
          });
          return;
        }

        // Extract all available languages
        const availableLanguages = captionTracks.map((track: any) => ({
          code: track.languageCode || track.vssId?.split('.')[0] || 'unknown',
          name: track.name?.simpleText || getLanguageName(track.languageCode || ''),
          isAutoGenerated: track.kind === 'asr'
        }));

        // Sort languages: English first, then alphabetically
        availableLanguages.sort((a: any, b: any) => {
          if (a.code === 'en') return -1;
          if (b.code === 'en') return 1;
          return a.name.localeCompare(b.name);
        });

        const languageCount = availableLanguages.length;
        const hasEnglish = availableLanguages.some((l: any) => l.code === 'en');
        
        setCaptionStatus({ 
          checking: false, 
          available: true, 
          languages: availableLanguages,
          message: `${languageCount} caption language${languageCount !== 1 ? 's' : ''} available`
        });

        // Auto-select English if available, otherwise first language
        setSelectedLanguage(hasEnglish ? 'en' : availableLanguages[0].code);

      } catch (parseError) {
        console.error("Error parsing caption tracks:", parseError);
        setCaptionStatus({ 
          checking: false, 
          available: null,
          message: "Error parsing caption data" 
        });
      }

    } catch (error) {
      console.error("Error checking captions:", error);
      setCaptionStatus({ 
        checking: false, 
        available: null,
        message: "Unable to check caption availability" 
      });
    }
  };

  const handleYouTubeUrlChange = (url: string) => {
    setYoutubeUrl(url);
    setCaptionStatus({ checking: false, available: null });
    
    // Debounce the caption check
    if (url.trim()) {
      const timer = setTimeout(() => {
        checkCaptionAvailability(url);
      }, 800);
      return () => clearTimeout(timer);
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
        body: { 
          youtubeUrl, 
          downloadVideo,
          language: selectedLanguage 
        },
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
    setCaptionStatus({ checking: false, available: null });
    setSelectedLanguage("en");
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
                    onChange={(e) => handleYouTubeUrlChange(e.target.value)}
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

              {/* Caption Availability Indicator */}
              {youtubeUrl && (
                <Alert className={
                  captionStatus.checking ? "" :
                  captionStatus.available === true ? "border-green-500 bg-green-50 dark:bg-green-950" :
                  captionStatus.available === false ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950" :
                  ""
                }>
                  {captionStatus.checking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <AlertDescription>
                        Checking caption availability...
                      </AlertDescription>
                    </>
                  ) : captionStatus.available === true ? (
                    <>
                      <Subtitles className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <AlertDescription className="text-green-700 dark:text-green-300">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <strong className="font-semibold">Captions Available!</strong>
                            <p className="text-sm mt-1">{captionStatus.message}</p>
                          </div>
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 ml-2" />
                        </div>
                      </AlertDescription>
                    </>
                  ) : captionStatus.available === false ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                        <div className="flex items-start justify-between">
                          <div>
                            <strong className="font-semibold">No Captions Found</strong>
                            <p className="text-sm mt-1">{captionStatus.message}</p>
                            <p className="text-xs mt-2 opacity-75">
                              This video may not work with the current transcription method. Try a video with captions/subtitles enabled.
                            </p>
                          </div>
                          <XCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 ml-2" />
                        </div>
                      </AlertDescription>
                    </>
                  ) : captionStatus.message ? (
                    <>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {captionStatus.message}
                      </AlertDescription>
                    </>
                  ) : null}
                </Alert>
              )}

              {/* Language Selector */}
              {captionStatus.available && captionStatus.languages && captionStatus.languages.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="caption-language">Caption Language</Label>
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage} disabled={isProcessing}>
                    <SelectTrigger id="caption-language">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {captionStatus.languages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {captionStatus.languages.length} language{captionStatus.languages.length !== 1 ? 's' : ''} available for this video
                  </p>
                </div>
              )}

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
