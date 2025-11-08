import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Upload, FileAudio, Loader2, Youtube, AlertTriangle, Shield, Eye, History, CheckCircle2, XCircle, Subtitles, AlertCircle, Search, ExternalLink } from "lucide-react";
import { calculateFileChecksum } from "@/lib/checksumUtils";
import { format } from "date-fns";
import { useTranscriptionProgress } from "@/hooks/useTranscriptionProgress";
import { useBatchTranscriptionProgress } from "@/hooks/useBatchTranscriptionProgress";

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
  const [captionPreview, setCaptionPreview] = useState<{
    isLoading: boolean;
    text: string | null;
    lines: string[];
  }>({ isLoading: false, text: null, lines: [] });
  const [showPreview, setShowPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLanguage, setSearchLanguage] = useState("any");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [batchVideoIds, setBatchVideoIds] = useState<string[]>([]);
  const batchProgress = useBatchTranscriptionProgress(batchVideoIds);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugLogs, setDebugLogs] = useState<Array<{
    timestamp: string;
    type: 'info' | 'success' | 'error' | 'warning';
    message: string;
  }>>([]);
  const [forceTranscribe, setForceTranscribe] = useState(false);
  
  // Extract video ID for progress tracking
  const extractVideoId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };
  
  const currentVideoId = youtubeUrl ? extractVideoId(youtubeUrl) : null;
  const progressUpdate = useTranscriptionProgress(currentVideoId);

  // Update UI based on progress
  useEffect(() => {
    if (progressUpdate && isProcessing) {
      setProgress(progressUpdate.progress);
      
      if (progressUpdate.status === 'completed') {
        setIsProcessing(false);
        setProgress(100);
      } else if (progressUpdate.status === 'failed') {
        setIsProcessing(false);
        setProgress(0);
        toast.error(progressUpdate.message || 'Transcription failed');
      }
    }
  }, [progressUpdate, isProcessing]);

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

  const addDebugLog = (type: 'info' | 'success' | 'error' | 'warning', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, { timestamp, type, message }]);
  };

  const checkCaptionAvailability = async (url: string) => {
    // Extract video ID from URL
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (!videoIdMatch) {
      setCaptionStatus({ checking: false, available: null, message: "Invalid YouTube URL" });
      addDebugLog('error', 'Invalid YouTube URL format');
      return;
    }

    const videoId = videoIdMatch[1];
    setDebugLogs([]); // Clear previous logs
    addDebugLog('info', `Starting caption check for video: ${videoId}`);
    addDebugLog('info', `Video URL: ${url}`);

    setCaptionStatus({ checking: true, available: null });

    const startTime = performance.now();

    try {
      addDebugLog('info', 'Sending request to edge function...');
      
      const { data, error } = await supabase.functions.invoke('transcribe-youtube', {
        body: { 
          youtubeUrl: url,
          checkOnly: true 
        }
      });

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      addDebugLog('info', `Response received in ${elapsed}s`);

      if (error) {
        addDebugLog('error', `Edge function error: ${error.message}`);
        throw error;
      }

      if (data.available && data.languages.length > 0) {
        addDebugLog('success', `Found ${data.languages.length} caption language(s)`);
        
        data.languages.forEach((lang: any) => {
          const autoGenText = lang.isAutoGenerated ? ' (auto-generated)' : '';
          addDebugLog('info', `  - ${lang.name} (${lang.code})${autoGenText}`);
        });

        // Auto-select English if available, otherwise first language
        const defaultLang = data.languages.find((l: any) => l.code === 'en') || data.languages[0];
        if (defaultLang) {
          setSelectedLanguage(defaultLang.code);
          addDebugLog('info', `Auto-selected language: ${defaultLang.name}`);
        }

        setCaptionStatus({
          checking: false,
          available: true,
          languages: data.languages,
          message: `${data.languages.length} caption language${data.languages.length > 1 ? 's' : ''} available`
        });
      } else {
        addDebugLog('warning', 'No captions found for this video');
        addDebugLog('info', 'Caption detection methods tried:');
        addDebugLog('info', '  1. Direct YouTube timedtext API');
        addDebugLog('info', '  2. HTML page scraping');
        addDebugLog('info', '  3. YouTube Data API v3');
        
        setCaptionStatus({
          checking: false,
          available: false,
          message: "No captions available for this video"
        });
      }
    } catch (error) {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      addDebugLog('error', `Request failed after ${elapsed}s`);
      addDebugLog('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      console.error("Error checking caption availability:", error);
      setCaptionStatus({
        checking: false,
        available: null,
        message: "Unable to check caption availability"
      });
    }
  };

  const handleSearchYouTube = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('search-youtube', {
        body: {
          query: searchQuery,
          language: searchLanguage === 'any' ? undefined : searchLanguage,
          maxResults: 10
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSearchResults(data.results || []);
      
      if (data.results.length === 0) {
        toast.info("No videos found with captions matching your criteria");
      } else {
        toast.success(`Found ${data.results.length} videos with captions`);
      }
    } catch (error: any) {
      console.error("Search error:", error);
      toast.error(error.message || "Failed to search YouTube videos");
    } finally {
      setIsSearching(false);
    }
  };

  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedVideos.size === searchResults.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(searchResults.map(v => v.videoId)));
    }
  };

  const handleBulkTranscribe = async () => {
    if (selectedVideos.size === 0) {
      toast.error("Please select at least one video");
      return;
    }

    const selectedVideosList = searchResults.filter(v => selectedVideos.has(v.videoId));
    
    setIsBulkProcessing(true);
    setBatchVideoIds(selectedVideosList.map(v => v.videoId));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      toast.info(`Starting batch transcription of ${selectedVideos.size} video${selectedVideos.size > 1 ? 's' : ''}...`);

      // Process each video sequentially to avoid overwhelming the API
      for (const video of selectedVideosList) {
        try {
          const { data, error } = await supabase.functions.invoke('transcribe-youtube', {
            body: {
              youtubeUrl: video.url,
              language: video.captions.hasRequestedLanguage && searchLanguage !== 'any' ? searchLanguage : 'en'
            }
          });

          if (error) {
            console.error(`Error transcribing ${video.title}:`, error);
            toast.error(`Failed to transcribe: ${video.title}`);
          } else if (data.error) {
            console.error(`Error transcribing ${video.title}:`, data.error);
            toast.error(`Failed to transcribe: ${video.title}`);
          } else {
            toast.success(`Completed: ${video.title}`);
          }

          // Small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error: any) {
          console.error(`Error processing ${video.title}:`, error);
          toast.error(`Failed to process: ${video.title}`);
        }
      }

      toast.success(`Batch transcription complete!`);
      setSelectedVideos(new Set());
      
    } catch (error: any) {
      console.error('Batch transcription error:', error);
      toast.error('Failed to complete batch transcription');
    } finally {
      setIsBulkProcessing(false);
    }
  };


  const handleSelectSearchResult = (videoUrl: string) => {
    setYoutubeUrl(videoUrl);
    setShowSearch(false);
    setSearchResults([]);
    setSearchQuery("");
    checkCaptionAvailability(videoUrl);
    toast.success("Video selected - checking captions...");
  };

  const handleYouTubeUrlChange = (url: string) => {
    // Clean and sanitize the URL - remove extra spaces and take only the first valid URL
    let cleanedUrl = url.trim();
    
    // If there are multiple URLs or fragments, extract just the first valid YouTube URL
    const youtubePattern = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = cleanedUrl.match(youtubePattern);
    
    if (match) {
      // Reconstruct a clean YouTube URL from the matched video ID
      const videoId = match[4];
      cleanedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }
    
    setYoutubeUrl(cleanedUrl);
    setCaptionStatus({ checking: false, available: null });
    setCaptionPreview({ isLoading: false, text: null, lines: [] });
    setShowPreview(false);
    
    // Debounce the caption check
    if (cleanedUrl.trim()) {
      const timer = setTimeout(() => {
        checkCaptionAvailability(cleanedUrl);
      }, 800);
      return () => clearTimeout(timer);
    }
  };

  const handleLoadPreview = async () => {
    if (!youtubeUrl.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    setCaptionPreview({ isLoading: true, text: null, lines: [] });
    setShowPreview(true);

    try {
      const { data, error } = await supabase.functions.invoke('transcribe-youtube', {
        body: { 
          youtubeUrl,
          language: selectedLanguage,
          previewOnly: true 
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setCaptionPreview({
        isLoading: false,
        text: data.preview,
        lines: data.lines
      });

      toast.success("Preview loaded successfully!");
    } catch (error: any) {
      console.error("Preview error:", error);
      toast.error(error.message || "Failed to load preview");
      setCaptionPreview({ isLoading: false, text: null, lines: [] });
    }
  };

  
  // Handle client-side audio download and transcription for videos without captions
  const handleClientSideAudioTranscription = async (videoId: string, videoUrl: string) => {
    try {
      toast.info("No captions found - downloading audio for transcription...", { duration: 3000 });
      
      // Step 1: Get the audio URL from our edge function
      setProgress(10);
      console.log("Getting audio URL for video:", videoId);
      
      const { data: audioData, error: audioError } = await supabase.functions.invoke('get-youtube-audio-url', {
        body: { videoId }
      });

      if (audioError) {
        console.error("Failed to get audio URL:", audioError);
        throw new Error("Failed to get audio URL from video");
      }

      if (!audioData || !audioData.audioUrl) {
        throw new Error("No audio URL returned from service");
      }

      console.log("Got audio URL, downloading audio...");
      setProgress(30);
      toast.info("Downloading audio from YouTube...", { duration: 3000 });

      // Step 2: Download the audio in the browser
      const audioResponse = await fetch(audioData.audioUrl);
      
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.status}`);
      }

      const audioBlob = await audioResponse.blob();
      console.log(`Audio downloaded: ${audioBlob.size} bytes`);
      
      setProgress(50);
      toast.info("Audio downloaded, transcribing with AI...", { duration: 3000 });

      // Step 3: Convert blob to base64 for the transcribe-audio function
      const reader = new FileReader();
      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove data:audio/webm;base64, prefix
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      console.log("Audio converted to base64, sending to transcription service...");
      setProgress(60);

      // Step 4: Send to transcribe-audio function
      const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio
        }
      });

      if (transcriptionError) {
        console.error("Transcription error:", transcriptionError);
        throw new Error(`Transcription failed: ${transcriptionError.message}`);
      }

      if (!transcriptionData || !transcriptionData.text) {
        throw new Error("No transcription text returned");
      }

      setProgress(100);
      console.log("Transcription complete!");

      // Get video title
      const titleResponse = await fetch(`https://www.youtube.com/oembed?url=${videoUrl}&format=json`);
      let title = `YouTube Video ${videoId}`;
      if (titleResponse.ok) {
        const titleData = await titleResponse.json();
        title = titleData.title || title;
      }

      // Save to database
      const { data: logEntry, error: logError } = await supabase
        .from("transcription_logs")
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          file_title: title,
          status: "completed",
          transcription_text: transcriptionData.text,
        })
        .select()
        .single();

      if (logError) {
        console.error("Error saving transcription log:", logError);
      }

      // Return in the same format as the normal transcription
      return {
        text: transcriptionData.text,
        title,
        method: "client_audio_download",
        language: selectedLanguage,
        logId: logEntry?.id
      };

    } catch (error: any) {
      console.error("Client-side audio transcription failed:", error);
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  };

  const handleYoutubeTranscribe = async () => {
    if (!youtubeUrl.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    // Validate and clean the URL one more time before submission
    const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) {
      toast.error("Invalid YouTube URL format. Please enter a valid YouTube video URL.");
      return;
    }
    
    // Ensure we're using a clean URL
    const cleanUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
    if (cleanUrl !== youtubeUrl) {
      console.log("URL was cleaned from:", youtubeUrl, "to:", cleanUrl);
      setYoutubeUrl(cleanUrl);
    }

    // If caption check hasn't run yet, trigger it and wait
    if (captionStatus.available === null && !captionStatus.checking && !forceTranscribe) {
      toast.info("Checking if video has captions...");
      setCaptionStatus({ checking: true, available: null });
      
      try {
        await checkCaptionAvailability(youtubeUrl);
        // After check completes, the user needs to click transcribe again
        toast.success("Caption check complete. Click 'Transcribe' again to continue.");
        return;
      } catch (error) {
        toast.error("Failed to check captions. Please try again.");
        setCaptionStatus({ checking: false, available: null });
        return;
      }
    }

    // Wait for ongoing caption check to complete
    if (captionStatus.checking && !forceTranscribe) {
      toast.warning("Caption check in progress... Please wait a moment.");
      return;
    }

    // Block transcription if captions aren't available
    if (captionStatus.available === false && !forceTranscribe) {
      toast.error("⚠️ This video doesn't have captions/subtitles. Please try a different video with captions, or download the audio and upload it as a file.", {
        duration: 6000,
      });
      return;
    }

    if (forceTranscribe) {
      toast.info("Force transcribe enabled - attempting transcription regardless of caption status...");
      addDebugLog('warning', 'Manual override: Force transcribe enabled');
    }

    const maxRetries = 3;
    let attempt = 0;
    let lastError: any = null;

    setIsProcessing(true);
    setProgress(0);
    setResult(null);

    const tryTranscribe = async (retryAttempt: number): Promise<any> => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error("You must be logged in to transcribe videos");
        }

        // Extract and validate video ID one more time before API call
        const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (!videoIdMatch) {
          throw new Error("Invalid YouTube URL");
        }
        const videoId = videoIdMatch[1];
        const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

        const progressInterval = setInterval(() => {
          setProgress((prev) => Math.min(prev + 10, 90));
        }, 500);

        const { data, error } = await supabase.functions.invoke("transcribe-youtube", {
          body: { 
            youtubeUrl: cleanUrl,
            downloadVideo,
            language: selectedLanguage 
          },
        });

        clearInterval(progressInterval);

        if (error) throw error;
        
        // Check if it's a NO_CAPTIONS_AVAILABLE error
        if (data.error && data.error === "NO_CAPTIONS_AVAILABLE") {
          throw new Error("NO_CAPTIONS_AVAILABLE");
        }
        
        if (data.error) throw new Error(data.error);

        setProgress(100);
        return data;
      } catch (error: any) {
        // Don't retry if video doesn't have captions - that won't change
        const isCaptionError = errorMessage.includes('does not have captions') || 
                              errorMessage.includes('subtitles available') ||
                              errorMessage.includes('NO_CAPTIONS_AVAILABLE');
        
        if (isCaptionError) {
          throw error; // Don't retry caption availability issues
        }
        
        if (retryAttempt < maxRetries) {
          const backoffDelay = Math.pow(2, retryAttempt) * 1000; // 1s, 2s, 4s
          toast.info(`Attempt ${retryAttempt + 1} failed. Retrying in ${backoffDelay / 1000}s...`, {
            duration: backoffDelay,
          });
          
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          throw error; // Re-throw to trigger retry
        } else {
          throw error; // Max retries reached
        }
      }
    };

    while (attempt <= maxRetries) {
      try {
        const data = await tryTranscribe(attempt);
        
        setResult({
          text: data.text,
          duration: data.duration,
          language: data.language,
          logId: data.logId,
          title: data.title,
        });

        toast.success("YouTube transcription completed successfully!");
        setIsProcessing(false);
        setProgress(0);
        return;
      } catch (error: any) {
        lastError = error;
        attempt++;
      }
    }

    // All retries failed
    console.error("YouTube transcription error:", lastError);
    
    const errorMessage = lastError?.message || "Failed to transcribe YouTube video";
    const isCaptionError = errorMessage.includes('does not have captions') || 
                          errorMessage.includes('subtitles available') ||
                          errorMessage.includes('NO_CAPTIONS_AVAILABLE');
    
    if (isCaptionError) {
      toast.error("This video doesn't have captions/subtitles available. Please use the search feature to find videos with captions, or download the audio and upload it as a file.", {
        duration: 8000,
      });
    } else {
      toast.error(errorMessage + " after multiple attempts");
    }
    
    setIsProcessing(false);
    setProgress(0);
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
    setCaptionPreview({ isLoading: false, text: null, lines: [] });
    setShowPreview(false);
    setShowSearch(false);
    setSearchResults([]);
    setSearchQuery("");
    setSearchLanguage("any");
    setSelectedVideos(new Set());
    setIsBulkProcessing(false);
    setBatchVideoIds([]);
    setForceTranscribe(false);
    setDebugLogs([]);
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
              {/* YouTube Search Feature */}
              <div className="space-y-3 pb-4 border-b">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Search YouTube Videos</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSearch(!showSearch)}
                  >
                    {showSearch ? 'Hide Search' : 'Show Search'}
                  </Button>
                </div>

                {showSearch && (
                  <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor="search-query">Search Query</Label>
                        <Input
                          id="search-query"
                          type="text"
                          placeholder="e.g., React tutorial, cooking recipes..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearchYouTube()}
                          disabled={isSearching}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="search-language">Caption Language (Optional)</Label>
                        <Select value={searchLanguage} onValueChange={setSearchLanguage} disabled={isSearching}>
                          <SelectTrigger id="search-language">
                            <SelectValue placeholder="Any language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any language</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="es">Spanish</SelectItem>
                            <SelectItem value="fr">French</SelectItem>
                            <SelectItem value="de">German</SelectItem>
                            <SelectItem value="it">Italian</SelectItem>
                            <SelectItem value="pt">Portuguese</SelectItem>
                            <SelectItem value="ja">Japanese</SelectItem>
                            <SelectItem value="ko">Korean</SelectItem>
                            <SelectItem value="zh">Chinese</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button
                      onClick={handleSearchYouTube}
                      disabled={!searchQuery.trim() || isSearching}
                      className="w-full"
                    >
                      {isSearching ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          Search Videos with Captions
                        </>
                      )}
                    </Button>

                    {/* Search Results */}
                    {searchResults.length > 0 && (
                      <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">Search Results ({searchResults.length})</Label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={toggleSelectAll}
                              disabled={isBulkProcessing}
                            >
                              {selectedVideos.size === searchResults.length ? 'Deselect All' : 'Select All'}
                            </Button>
                            {selectedVideos.size > 0 && (
                              <Button
                                size="sm"
                                onClick={handleBulkTranscribe}
                                disabled={isBulkProcessing}
                              >
                                {isBulkProcessing ? (
                                  <>
                                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    Processing {selectedVideos.size}...
                                  </>
                                ) : (
                                  <>
                                    <Youtube className="mr-2 h-3 w-3" />
                                    Transcribe {selectedVideos.size} Selected
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div className="max-h-96 overflow-y-auto space-y-2">
                          {searchResults.map((video) => {
                            const isSelected = selectedVideos.has(video.videoId);
                            const progress = batchProgress[video.videoId];
                            
                            return (
                              <Card 
                                key={video.videoId}
                                className={`transition-colors ${
                                  isSelected ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
                                } ${progress?.status === 'completed' ? 'border-green-500' : ''} ${
                                  progress?.status === 'failed' ? 'border-red-500' : ''
                                }`}
                              >
                                <CardContent className="p-3">
                                  <div className="flex gap-3">
                                    <div className="flex items-start pt-1">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleVideoSelection(video.videoId)}
                                        disabled={isBulkProcessing}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    <div 
                                      className="flex gap-3 flex-1 cursor-pointer"
                                      onClick={() => !isBulkProcessing && handleSelectSearchResult(video.url)}
                                    >
                                      <img 
                                        src={video.thumbnail} 
                                        alt={video.title}
                                        className="w-32 h-20 object-cover rounded flex-shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-sm line-clamp-2 mb-1">{video.title}</h4>
                                        <p className="text-xs text-muted-foreground mb-2">{video.channelTitle}</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <div className="flex items-center gap-1 text-xs">
                                            <Subtitles className="h-3 w-3 text-green-600" />
                                            <span className="text-green-600 font-medium">
                                              {video.captions.languages.length} caption{video.captions.languages.length !== 1 ? 's' : ''}
                                            </span>
                                          </div>
                                          {video.captions.hasRequestedLanguage && (
                                            <div className="flex items-center gap-1 text-xs">
                                              <CheckCircle2 className="h-3 w-3 text-blue-600" />
                                              <span className="text-blue-600 font-medium">Target language</span>
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Bulk Progress Indicator */}
                                        {progress && (
                                          <div className="mt-2 space-y-1">
                                            {progress.status === 'processing' && (
                                              <>
                                                <div className="flex items-center gap-2 text-xs">
                                                  <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                                                  <span className="text-blue-600 font-medium">Transcribing...</span>
                                                </div>
                                                <Progress value={progress.progress} className="h-1" />
                                              </>
                                            )}
                                            {progress.status === 'completed' && (
                                              <div className="flex items-center gap-2 text-xs">
                                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                <span className="text-green-600 font-medium">Completed</span>
                                              </div>
                                            )}
                                             {progress.status === 'failed' && (
                                              <div className="flex items-center gap-2 text-xs">
                                                <XCircle className="h-3 w-3 text-red-600" />
                                                <span className="text-red-600 font-medium">{progress.message || 'Failed'}</span>
                                              </div>
                                            )}
                                            {progress.status === 'pending' && (
                                              <div className="flex items-center gap-2 text-xs">
                                                <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
                                                <span className="text-muted-foreground font-medium">Pending...</span>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                  Paste a YouTube video URL or use the search feature above
                </p>
              </div>

              {/* Caption-Only Notice */}
              <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
                <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-700 dark:text-blue-300">
                  <strong>YouTube Transcription:</strong> This feature only works with videos that have captions/subtitles enabled. 
                  For videos without captions, download the audio manually and upload it using the "Upload File" tab above.
                </AlertDescription>
              </Alert>
                
              {/* Debug Panel Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className="w-full mt-2"
              >
                {showDebugPanel ? 'Hide' : 'Show'} Caption Detection Debug Panel
              </Button>

              {/* Debug Panel */}
              {showDebugPanel && debugLogs.length > 0 && (
                <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Caption Detection Debug Logs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-xs">
                      {debugLogs.map((log, index) => (
                        <div 
                          key={index} 
                          className={`flex items-start gap-2 p-2 rounded ${
                            log.type === 'error' ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
                            log.type === 'success' ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300' :
                            log.type === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300' :
                            'bg-background text-foreground'
                          }`}
                        >
                          <span className="text-muted-foreground shrink-0">[{log.timestamp}]</span>
                          <span className="break-all">{log.message}</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDebugLogs([])}
                      className="w-full mt-3"
                    >
                      Clear Logs
                    </Button>
                  </CardContent>
                </Card>
              )}

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
                            <strong className="font-semibold">No Captions Available</strong>
                            <p className="text-sm mt-1">{captionStatus.message}</p>
                            <p className="text-xs mt-2 opacity-90">
                              <strong>Options:</strong>
                            </p>
                            <ul className="text-xs mt-1 space-y-1 ml-4 list-disc">
                              <li>Use the search feature above to find videos with captions</li>
                              <li>Download the video's audio manually and upload it using the "Upload File" tab</li>
                              <li>Try a different video that has captions enabled</li>
                            </ul>
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

              {/* Preview Button and Display */}
              {captionStatus.available && !isProcessing && (
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    onClick={handleLoadPreview}
                    disabled={captionPreview.isLoading}
                    className="w-full"
                  >
                    {captionPreview.isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading preview...
                      </>
                    ) : (
                      <>
                        <Eye className="mr-2 h-4 w-4" />
                        Preview First Few Lines
                      </>
                    )}
                  </Button>

                  {showPreview && captionPreview.text && (
                    <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
                      <Subtitles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <AlertDescription className="text-blue-700 dark:text-blue-300">
                        <div className="space-y-2">
                          <strong className="font-semibold">Caption Preview:</strong>
                          <div className="mt-2 p-3 bg-background/50 rounded border border-border">
                            <p className="text-sm whitespace-pre-wrap">{captionPreview.text}</p>
                          </div>
                          <p className="text-xs opacity-75 mt-2">
                            Showing first {captionPreview.lines.length} caption lines
                          </p>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
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
                <Card className="border-primary">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm font-medium">
                        {progressUpdate?.message || 'Processing...'}
                      </span>
                    </div>
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground text-center">
                      {progress}% complete
                    </p>
                    {progressUpdate?.status === 'downloading' && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Downloading audio from YouTube... This may take a moment.
                        </AlertDescription>
                      </Alert>
                    )}
                    {progressUpdate?.status === 'transcribing' && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Transcribing audio with AI... Please wait.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={handleYoutubeTranscribe}
                disabled={
                  !youtubeUrl.trim() || 
                  isProcessing || 
                  captionStatus.checking ||
                  (captionStatus.available === false && !forceTranscribe)
                }
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : captionStatus.checking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking Captions...
                  </>
                ) : captionStatus.available === false && !forceTranscribe ? (
                  <>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    No Captions - Cannot Transcribe
                  </>
                ) : captionStatus.available === true ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {forceTranscribe ? 'Force Transcribe Video' : 'Transcribe YouTube Video'}
                  </>
                ) : (
                  <>
                    <Youtube className="mr-2 h-4 w-4" />
                    Check Captions & Transcribe
                  </>
                )}
              </Button>
              
              {captionStatus.available === false && youtubeUrl.trim() && !isProcessing && (
                <div className="space-y-3">
                  <Alert variant="destructive" className="border-red-500">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong className="font-semibold">Captions Required</strong>
                      <p className="text-sm mt-1">This video doesn't have captions/subtitles enabled. Please select a different video that has captions available.</p>
                    </AlertDescription>
                  </Alert>
                  
                  <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                    <Shield className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                      <div className="space-y-3">
                        <div>
                          <strong className="font-semibold">Force Transcribe Option</strong>
                          <p className="text-sm mt-1">
                            Sometimes caption detection fails even when captions exist. You can enable force transcribe to attempt the transcription anyway.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="force-transcribe"
                            checked={forceTranscribe}
                            onCheckedChange={(checked) => setForceTranscribe(checked as boolean)}
                          />
                          <label
                            htmlFor="force-transcribe"
                            className="text-sm font-medium cursor-pointer"
                          >
                            Enable Force Transcribe (bypass caption detection)
                          </label>
                        </div>
                        {forceTranscribe && (
                          <p className="text-xs opacity-75">
                            ⚠️ Warning: This may fail if the video truly has no captions available.
                          </p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Batch Progress Panel */}
      {isBulkProcessing && batchVideoIds.length > 0 && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Batch Transcription In Progress
            </CardTitle>
            <CardDescription>
              Processing {batchVideoIds.length} video{batchVideoIds.length > 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {batchVideoIds.map((videoId) => {
              const video = searchResults.find(v => v.videoId === videoId);
              const progress = batchProgress[videoId];
              
              if (!video) return null;

              return (
                <div key={videoId} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-start gap-3">
                    <img 
                      src={video.thumbnail} 
                      alt={video.title}
                      className="w-24 h-16 object-cover rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm line-clamp-1">{video.title}</h4>
                      <p className="text-xs text-muted-foreground">{video.channelTitle}</p>
                      
                      {progress && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">
                              {progress.status === 'starting' && 'Initializing...'}
                              {progress.status === 'downloading' && 'Downloading audio...'}
                              {progress.status === 'transcribing' && 'Transcribing...'}
                              {progress.status === 'completed' && '✓ Completed'}
                              {progress.status === 'failed' && '✗ Failed'}
                            </span>
                            <span className="text-muted-foreground">{progress.progress}%</span>
                          </div>
                          <Progress value={progress.progress} className="h-1" />
                          {progress.message && (
                            <p className="text-xs text-muted-foreground">{progress.message}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
