import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoId } = await req.json();
    
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "No video ID provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get video page to extract audio URL
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video page: ${response.status}`);
    }

    const html = await response.text();
    
    // Extract player response from the page
    const playerResponseMatch = html.match(/var ytInitialPlayerResponse = ({.+?});/);
    
    if (!playerResponseMatch) {
      throw new Error("Could not find player response in page");
    }

    const playerResponse = JSON.parse(playerResponseMatch[1]);
    
    // Get streaming data
    const streamingData = playerResponse.streamingData;
    
    if (!streamingData || !streamingData.adaptiveFormats) {
      throw new Error("No streaming data available");
    }

    // Find audio-only format
    const audioFormats = streamingData.adaptiveFormats.filter((format: any) => 
      format.mimeType && format.mimeType.includes('audio')
    );

    if (audioFormats.length === 0) {
      throw new Error("No audio formats found");
    }

    // Get the best quality audio
    const bestAudio = audioFormats.reduce((best: any, current: any) => {
      return (current.bitrate || 0) > (best.bitrate || 0) ? current : best;
    });

    return new Response(
      JSON.stringify({
        audioUrl: bestAudio.url,
        mimeType: bestAudio.mimeType,
        bitrate: bestAudio.bitrate,
        contentLength: bestAudio.contentLength
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error getting audio URL:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        suggestion: "This video may have restricted access or require signing in"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
