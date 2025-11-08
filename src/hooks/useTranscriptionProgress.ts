import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ProgressUpdate {
  video_id: string;
  status: string;
  progress: number;
  message: string;
  updated_at: string;
}

export function useTranscriptionProgress(videoId: string | null) {
  const [progressData, setProgressData] = useState<ProgressUpdate | null>(null);

  useEffect(() => {
    if (!videoId) {
      setProgressData(null);
      return;
    }

    // Subscribe to real-time updates for this video
    const channel = supabase
      .channel(`progress-${videoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transcription_progress',
          filter: `video_id=eq.${videoId}`
        },
        (payload) => {
          console.log('Progress update:', payload);
          if (payload.new) {
            setProgressData(payload.new as ProgressUpdate);
          }
        }
      )
      .subscribe();

    // Fetch initial state
    const fetchInitialProgress = async () => {
      const { data } = await supabase
        .from('transcription_progress')
        .select('*')
        .eq('video_id', videoId)
        .maybeSingle();

      if (data) {
        setProgressData(data as ProgressUpdate);
      }
    };

    fetchInitialProgress();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId]);

  return progressData;
}
