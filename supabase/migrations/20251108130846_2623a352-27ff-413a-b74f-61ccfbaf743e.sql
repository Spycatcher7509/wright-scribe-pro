-- Add unique constraint for user_id and video_id combination
ALTER TABLE public.transcription_progress 
ADD CONSTRAINT transcription_progress_user_video_unique 
UNIQUE (user_id, video_id);