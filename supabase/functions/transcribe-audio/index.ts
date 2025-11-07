import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

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

    const formData = await req.formData();
    const audioFile = formData.get("file") as File;
    const fileName = formData.get("fileName") as string;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: "No audio file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing transcription for user ${user.id}, file: ${fileName}`);

    // Create transcription log entry with pending status
    const { data: logEntry, error: logError } = await supabase
      .from("transcription_logs")
      .insert({
        user_id: user.id,
        file_title: fileName,
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
    whisperFormData.append("file", audioFile);
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
      
      // Update log with error
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

    // Update log with success
    await supabase
      .from("transcription_logs")
      .update({
        status: "completed",
      })
      .eq("id", logEntry.id);

    return new Response(
      JSON.stringify({
        success: true,
        text: result.text,
        duration: result.duration,
        language: result.language,
        logId: logEntry.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in transcribe-audio function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
