import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Square, Loader2, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function QuickRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processRecording(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success("Recording started");
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error("Failed to access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.info("Processing recording...");
    }
  };

  const processRecording = async (audioBlob: Blob) => {
    setIsProcessing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to transcribe audio");
        return;
      }

      // Calculate checksum from blob
      const arrayBuffer = await audioBlob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const fileName = `recording-${Date.now()}.webm`;

      const formData = new FormData();
      formData.append("audio", audioBlob, fileName);
      formData.append("filename", fileName);
      formData.append("checksum", checksum);

      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: formData,
      });

      if (error) throw error;

      if (data.cached) {
        toast.info("Found existing transcription");
      } else {
        toast.success("Transcription complete!");
      }

      setTranscription(data.transcription);
    } catch (error) {
      console.error("Error processing recording:", error);
      toast.error("Failed to transcribe audio");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcription);
    toast.success("Copied to clipboard!");
  };

  const downloadText = () => {
    const blob = new Blob([transcription], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcription-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded!");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quick Record & Transcribe</CardTitle>
          <CardDescription>
            Click to record audio directly from your microphone
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {!isRecording && !isProcessing && (
            <Button
              size="lg"
              onClick={startRecording}
              className="h-24 w-24 rounded-full"
            >
              <Mic className="h-8 w-8" />
            </Button>
          )}

          {isRecording && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={stopRecording}
                  className="h-24 w-24 rounded-full animate-pulse"
                >
                  <Square className="h-8 w-8" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Click to stop recording</p>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Transcribing...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {transcription && (
        <Card>
          <CardHeader>
            <CardTitle>Transcription Result</CardTitle>
            <CardDescription>Your recorded audio has been transcribed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg max-h-96 overflow-y-auto">
              <p className="whitespace-pre-wrap">{transcription}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyToClipboard} variant="outline" className="flex-1">
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
              <Button onClick={downloadText} variant="outline" className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
