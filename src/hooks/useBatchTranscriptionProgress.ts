import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ProgressUpdate {
  video_id: string;
  status: string;
  progress: number;
  message: string;
  updated_at: string;
}

interface BatchProgress {
  [videoId: string]: ProgressUpdate;
}

export function useBatchTranscriptionProgress(videoIds: string[]) {
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({});

  useEffect(() => {
    if (videoIds.length === 0) {
      setBatchProgress({});
      return;
    }

    // Subscribe to real-time updates for all videos
    const channel = supabase
      .channel('batch-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transcription_progress'
        },
        (payload) => {
          console.log('Batch progress update:', payload);
          if (payload.new && videoIds.includes((payload.new as ProgressUpdate).video_id)) {
            setBatchProgress(prev => ({
              ...prev,
              [(payload.new as ProgressUpdate).video_id]: payload.new as ProgressUpdate
            }));
          }
        }
      )
      .subscribe();

    // Fetch initial state for all videos
    const fetchInitialProgress = async () => {
      const { data } = await supabase
        .from('transcription_progress')
        .select('*')
        .in('video_id', videoIds);

      if (data) {
        const progressMap: BatchProgress = {};
        data.forEach((item: any) => {
          progressMap[item.video_id] = item;
        });
        setBatchProgress(progressMap);
      }
    };

    fetchInitialProgress();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoIds.join(',')]);

  return batchProgress;
}
