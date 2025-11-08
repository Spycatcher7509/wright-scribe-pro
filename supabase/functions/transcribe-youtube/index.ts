import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);

const createEmailHTML = (fileName: string, transcriptionText: string, duration?: number, language?: string, timestamp?: string) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcription Complete</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 40px 40px 20px;">
        <h1 style="color: #333; font-size: 24px; font-weight: bold; margin: 0 0 20px;">Transcription Complete</h1>
        <p style="color: #333; font-size: 14px; line-height: 24px; margin: 0 0 24px;">Your YouTube video transcription has been successfully processed.</p>
        
        <div style="margin: 24px 0;">
          <p style="color: #666; font-size: 12px; font-weight: bold; text-transform: uppercase; margin: 8px 0 4px; letter-spacing: 0.5px;">Video:</p>
          <p style="color: #333; font-size: 14px; margin: 0 0 12px;">${fileName}</p>
          
          ${duration ? `
          <p style="color: #666; font-size: 12px; font-weight: bold; text-transform: uppercase; margin: 8px 0 4px; letter-spacing: 0.5px;">Duration:</p>
          <p style="color: #333; font-size: 14px; margin: 0 0 12px;">${Math.round(duration)} seconds</p>
          ` : ''}
          
          ${language ? `
          <p style="color: #666; font-size: 12px; font-weight: bold; text-transform: uppercase; margin: 8px 0 4px; letter-spacing: 0.5px;">Language:</p>
          <p style="color: #333; font-size: 14px; margin: 0 0 12px;">${language}</p>
          ` : ''}
          
          ${timestamp ? `
          <p style="color: #666; font-size: 12px; font-weight: bold; text-transform: uppercase; margin: 8px 0 4px; letter-spacing: 0.5px;">Completed:</p>
          <p style="color: #333; font-size: 14px; margin: 0 0 12px;">${timestamp}</p>
          ` : ''}
        </div>
        
        <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 20px 0;">
        
        <h2 style="color: #333; font-size: 18px; font-weight: bold; margin: 20px 0 12px;">Transcription</h2>
        <div style="background-color: #f4f4f4; border-radius: 5px; border: 1px solid #eee; padding: 20px; margin: 0 0 20px;">
          <p style="color: #333; font-size: 14px; line-height: 22px; margin: 0; white-space: pre-wrap;">${transcriptionText}</p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 20px 0;">
        
        <p style="color: #8898aa; font-size: 12px; line-height: 16px; margin: 32px 0 0;">
          This is an automated message from The Wright Scriber Pro.<br>
          If you did not request this transcription, please contact support.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// Extract YouTube video ID from URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// Strategy 1: Get transcript directly from YouTube (fastest, most reliable)
async function getYouTubeTranscript(videoId: string, language: string = 'en'): Promise<string | null> {
  console.log(`Attempting to fetch YouTube transcript/captions in language: ${language}...`);
  
  try {
    // Fetch video page to extract transcript data
    const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    
    if (!videoPageResponse.ok) {
      console.log("Failed to fetch video page");
      return null;
    }
    
    const html = await videoPageResponse.text();
    
    // Extract caption tracks from the page
    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    
    if (!captionTracksMatch) {
      console.log("No captions found in video page");
      return null;
    }
    
    const captionTracks = JSON.parse(captionTracksMatch[1]);
    
    if (!captionTracks || captionTracks.length === 0) {
      console.log("Caption tracks array is empty");
      return null;
    }
    
    // Try to find the requested language, otherwise fall back to English, then first available
    let track = captionTracks.find((t: any) => t.languageCode === language);
    
    if (!track && language !== 'en') {
      console.log(`Language ${language} not found, trying English...`);
      track = captionTracks.find((t: any) => t.languageCode === 'en');
    }
    
    if (!track) {
      console.log("Requested languages not found, using first available");
      track = captionTracks[0];
    }
    
    console.log(`Using caption track: ${track.languageCode || 'unknown'}`);
    
    if (!track.baseUrl) {
      console.log("No baseUrl found in caption track");
      return null;
    }
    
    // Fetch the caption file
    const captionResponse = await fetch(track.baseUrl);
    
    if (!captionResponse.ok) {
      console.log("Failed to fetch caption file");
      return null;
    }
    
    const captionXml = await captionResponse.text();
    
    // Parse XML and extract text
    const textMatches = captionXml.matchAll(/<text[^>]*>(.*?)<\/text>/g);
    const texts: string[] = [];
    
    for (const match of textMatches) {
      // Decode HTML entities
      const text = match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, "") // Remove any remaining HTML tags
        .trim();
      
      if (text) {
        texts.push(text);
      }
    }
    
    if (texts.length === 0) {
      console.log("No text extracted from captions");
      return null;
    }
    
    const transcript = texts.join(" ");
    console.log(`Successfully extracted transcript (${transcript.length} characters)`);
    return transcript;
    
  } catch (error: any) {
    console.error("Error fetching YouTube transcript:", error.message);
    return null;
  }
}

// Strategy 2: Use third-party transcript API
async function getTranscriptViaAPI(videoId: string, language: string = 'en'): Promise<string | null> {
  console.log(`Attempting to fetch transcript via API in language: ${language}...`);
  
  try {
    const response = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}`);
    
    if (!response.ok) {
      console.log("Transcript API request failed");
      return null;
    }
    
    const xml = await response.text();
    
    if (!xml || xml.trim().length === 0) {
      console.log("Empty response from transcript API");
      return null;
    }
    
    // Parse XML
    const textMatches = xml.matchAll(/<text[^>]*>(.*?)<\/text>/g);
    const texts: string[] = [];
    
    for (const match of textMatches) {
      const text = match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, "")
        .trim();
      
      if (text) {
        texts.push(text);
      }
    }
    
    if (texts.length === 0) {
      console.log("No text found in transcript API response");
      return null;
    }
    
    const transcript = texts.join(" ");
    console.log(`Successfully fetched transcript via API (${transcript.length} characters)`);
    return transcript;
    
  } catch (error: any) {
    console.error("Error with transcript API:", error.message);
    return null;
  }
}

// Main function to get transcript or audio
async function getYouTubeContent(videoId: string, language: string = 'en'): Promise<{ text?: string; audioBlob?: Blob; title: string; method: string; language?: string }> {
  // Get video title from YouTube oEmbed API
  const videoInfoResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
  let title = `YouTube Video ${videoId}`;
  
  if (videoInfoResponse.ok) {
    const videoInfo = await videoInfoResponse.json();
    title = videoInfo.title || title;
  }

  console.log(`Processing video: ${title}, language: ${language}`);

  // Try to get transcript first (much faster and cheaper)
  let transcript = await getYouTubeTranscript(videoId, language);
  
  if (transcript) {
    console.log("Using direct YouTube transcript");
    return { text: transcript, title, method: "youtube_captions", language };
  }

  // Try alternative transcript API
  transcript = await getTranscriptViaAPI(videoId, language);
  
  if (transcript) {
    console.log("Using transcript API");
    return { text: transcript, title, method: "transcript_api", language };
  }

  // If no transcript available, fall back to audio transcription
  console.log("No transcript available, falling back to audio download + Whisper");
  throw new Error("Video does not have captions/subtitles available. Audio download feature has been temporarily disabled due to third-party API issues. Please try a video with captions enabled.");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { youtubeUrl, language: requestedLanguage = 'en', checkOnly = false, previewOnly = false } = await req.json();

    if (!youtubeUrl) {
      return new Response(
        JSON.stringify({ error: "No YouTube URL provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract video ID
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Invalid YouTube URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If previewOnly mode, fetch and return first few caption lines
    if (previewOnly) {
      console.log(`Fetching caption preview for video: ${videoId}, language: ${requestedLanguage}`);
      
      try {
        const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        
        if (!videoPageResponse.ok) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch video page" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const html = await videoPageResponse.text();
        const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
        
        if (!captionTracksMatch) {
          return new Response(
            JSON.stringify({ error: "No captions found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const captionTracks = JSON.parse(captionTracksMatch[1]);
        let track = captionTracks.find((t: any) => t.languageCode === requestedLanguage);
        
        if (!track && requestedLanguage !== 'en') {
          track = captionTracks.find((t: any) => t.languageCode === 'en');
        }
        
        if (!track) {
          track = captionTracks[0];
        }
        
        if (!track.baseUrl) {
          return new Response(
            JSON.stringify({ error: "No caption URL found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const captionResponse = await fetch(track.baseUrl);
        
        if (!captionResponse.ok) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch captions" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const captionXml = await captionResponse.text();
        const textMatches = captionXml.matchAll(/<text[^>]*>(.*?)<\/text>/g);
        const texts: string[] = [];
        
        let count = 0;
        for (const match of textMatches) {
          if (count >= 5) break; // Get first 5 lines
          
          const text = match[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<[^>]+>/g, "")
            .trim();
          
          if (text) {
            texts.push(text);
            count++;
          }
        }
        
        return new Response(
          JSON.stringify({ 
            preview: texts.join(" "),
            lines: texts,
            language: track.languageCode 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        console.error("Error fetching preview:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // If checkOnly mode, just return available caption languages
    if (checkOnly) {
      console.log(`Checking caption availability for video: ${videoId}`);
      
      try {
        const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        
        if (!videoPageResponse.ok) {
          return new Response(
            JSON.stringify({ available: false, languages: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const html = await videoPageResponse.text();
        const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
        
        if (!captionTracksMatch) {
          return new Response(
            JSON.stringify({ available: false, languages: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const captionTracks = JSON.parse(captionTracksMatch[1]);
        const languages = captionTracks.map((track: any) => ({
          code: track.languageCode,
          name: track.name?.simpleText || track.languageCode,
          isAutoGenerated: track.kind === 'asr'
        }));
        
        // Sort: English first, then others alphabetically
        languages.sort((a: any, b: any) => {
          if (a.code === 'en') return -1;
          if (b.code === 'en') return 1;
          return a.name.localeCompare(b.name);
        });
        
        return new Response(
          JSON.stringify({ available: true, languages }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        console.error("Error checking captions:", error);
        return new Response(
          JSON.stringify({ available: false, languages: [], error: error.message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Processing YouTube transcription for user ${user.id}, video: ${videoId}, language: ${requestedLanguage}`);

    // Get transcript or audio
    let content;
    try {
      content = await getYouTubeContent(videoId, requestedLanguage);
    } catch (contentError: any) {
      console.error("Failed to get YouTube content:", contentError);
      
      // Return a more helpful error message
      return new Response(
        JSON.stringify({ 
          error: contentError.message || "Failed to process video",
          suggestion: "Please ensure the video has captions/subtitles enabled, or try a different video."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create transcription log entry
    const { data: logEntry, error: logError } = await supabase
      .from("transcription_logs")
      .insert({
        user_id: user.id,
        file_title: content.title,
        status: "processing",
      })
      .select()
      .single();

    if (logError) {
      console.error("Error creating log entry:", logError);
      return new Response(
        JSON.stringify({ error: "Failed to create log entry" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let transcriptionText: string;
    let duration: number | undefined;
    let language: string | undefined;

    // If we got text directly from captions, use it
    if (content.text) {
      console.log("Using captions directly, no Whisper needed");
      transcriptionText = content.text;
      language = content.language || requestedLanguage; // Use detected language from captions
    } else if (content.audioBlob) {
      // Fallback: transcribe audio with Whisper
      console.log("Transcribing audio with Whisper");
      
      const whisperFormData = new FormData();
      whisperFormData.append("file", content.audioBlob, "audio.mp3");
      whisperFormData.append("model", "whisper-1");
      whisperFormData.append("response_format", "verbose_json");

      const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
        },
        body: whisperFormData,
      });

      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        console.error("OpenAI API error:", errorText);
        
        await supabase
          .from("transcription_logs")
          .update({
            status: "failed",
            error_message: `OpenAI API error: ${errorText}`,
          })
          .eq("id", logEntry.id);

        return new Response(
          JSON.stringify({ error: "Transcription failed", details: errorText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await whisperResponse.json();
      transcriptionText = result.text;
      duration = result.duration;
      language = result.language;
    } else {
      throw new Error("No content available from any method");
    }

    console.log("Transcription successful");

    // Update log with success and transcription text
    await supabase
      .from("transcription_logs")
      .update({
        status: "completed",
        transcription_text: transcriptionText,
      })
      .eq("id", logEntry.id);

    // Send email notification
    try {
      const timestamp = new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const html = createEmailHTML(
        content.title,
        transcriptionText,
        duration,
        language,
        timestamp
      );

      const { error: emailError } = await resend.emails.send({
        from: "The Wright Scriber Pro <onboarding@resend.dev>",
        to: [user.email!],
        subject: `YouTube Transcription Complete: ${content.title}`,
        html,
      });

      if (emailError) {
        console.error("Error sending email:", emailError);
      } else {
        console.log(`Email sent successfully to ${user.email}`);
      }
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: transcriptionText,
        duration: duration,
        language: language,
        logId: logEntry.id,
        title: content.title,
        method: content.method,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in transcribe-youtube function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
