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

// Download audio from YouTube using ytdl-core compatible approach
async function downloadYouTubeAudio(videoId: string): Promise<{ audioBlob: Blob; title: string }> {
  // Get video title from YouTube oEmbed API
  const videoInfoResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
  let title = `YouTube Video ${videoId}`;
  
  if (videoInfoResponse.ok) {
    const videoInfo = await videoInfoResponse.json();
    title = videoInfo.title || title;
  }

  // Use a third-party service to download YouTube audio
  // Option 1: Using y2mate.com API (free alternative)
  const downloadResponse = await fetch(`https://www.y2mate.com/mates/analyzeV2/ajax`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      k_query: `https://www.youtube.com/watch?v=${videoId}`,
      k_page: "home",
      hl: "en",
      q_auto: "0",
    }),
  });

  if (!downloadResponse.ok) {
    throw new Error(`Failed to analyze YouTube video: ${await downloadResponse.text()}`);
  }

  const analyzeData = await downloadResponse.json();
  
  if (!analyzeData.links || !analyzeData.links.mp3) {
    throw new Error("No audio format available for this video");
  }

  // Get the best quality MP3
  const audioFormats = Object.values(analyzeData.links.mp3) as any[];
  const bestAudio = audioFormats.find((f: any) => f.q === "128") || audioFormats[0];
  
  if (!bestAudio || !bestAudio.k) {
    throw new Error("Could not find suitable audio format");
  }

  // Get download link
  const convertResponse = await fetch(`https://www.y2mate.com/mates/convertV2/index`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      vid: videoId,
      k: bestAudio.k,
    }),
  });

  if (!convertResponse.ok) {
    throw new Error(`Failed to convert video: ${await convertResponse.text()}`);
  }

  const convertData = await convertResponse.json();
  
  if (!convertData.dlink) {
    throw new Error("Failed to get download link");
  }

  // Download the audio file
  const audioResponse = await fetch(convertData.dlink);
  
  if (!audioResponse.ok) {
    throw new Error("Failed to download audio file");
  }

  const audioBlob = await audioResponse.blob();

  return { audioBlob, title };
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

    const { youtubeUrl } = await req.json();

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

    console.log(`Processing YouTube transcription for user ${user.id}, video: ${videoId}`);

    // Download audio
    const { audioBlob, title } = await downloadYouTubeAudio(videoId);

    // Create transcription log entry
    const { data: logEntry, error: logError } = await supabase
      .from("transcription_logs")
      .insert({
        user_id: user.id,
        file_title: title,
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

    // Prepare form data for OpenAI Whisper
    const whisperFormData = new FormData();
    whisperFormData.append("file", audioBlob, "audio.mp3");
    whisperFormData.append("model", "whisper-1");
    whisperFormData.append("response_format", "verbose_json");

    // Send to OpenAI Whisper
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
    console.log("Transcription successful");

    // Update log with success and transcription text
    await supabase
      .from("transcription_logs")
      .update({
        status: "completed",
        transcription_text: result.text,
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
        title,
        result.text,
        result.duration,
        result.language,
        timestamp
      );

      const { error: emailError } = await resend.emails.send({
        from: "The Wright Scriber Pro <onboarding@resend.dev>",
        to: [user.email!],
        subject: `YouTube Transcription Complete: ${title}`,
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
        text: result.text,
        duration: result.duration,
        language: result.language,
        logId: logEntry.id,
        title,
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
