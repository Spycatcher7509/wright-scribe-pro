import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting audio translation...');

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string;
    const fileChecksum = formData.get('fileChecksum') as string;

    if (!file) {
      throw new Error('No file provided');
    }

    console.log(`Translating file: ${fileName}, size: ${file.size} bytes, checksum: ${fileChecksum}`);

    // Check for duplicate file by checksum (for translations)
    if (fileChecksum) {
      const { data: existingLog } = await supabase
        .from('transcription_logs')
        .select('*')
        .eq('file_checksum', fileChecksum)
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingLog) {
        console.log('Duplicate file found, returning cached result');
        return new Response(
          JSON.stringify({
            text: existingLog.transcription_text,
            logId: existingLog.id,
            language: 'en',
            cached: true,
            message: 'Returned cached translation for duplicate file',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Create a log entry in the database
    const { data: logData, error: logError } = await supabase
      .from('transcription_logs')
      .insert({
        user_id: user.id,
        file_title: fileName,
        file_checksum: fileChecksum,
        status: 'processing',
      })
      .select()
      .single();

    if (logError) {
      console.error('Error creating log:', logError);
      throw new Error('Failed to create transcription log');
    }

    const logId = logData.id;

    try {
      // Prepare form data for OpenAI
      const openAIFormData = new FormData();
      openAIFormData.append('file', file);
      openAIFormData.append('model', 'whisper-1');

      console.log('Sending to OpenAI translation API...');

      // Send to OpenAI Whisper translation endpoint
      // Note: Translation endpoint translates audio to English
      const response = await fetch('https://api.openai.com/v1/audio/translations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
        },
        body: openAIFormData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Translation successful, length:', result.text.length);

      // Update the log with the translation
      const { error: updateError } = await supabase
        .from('transcription_logs')
        .update({
          status: 'completed',
          transcription_text: result.text,
        })
        .eq('id', logId);

      if (updateError) {
        console.error('Error updating log:', updateError);
        throw new Error('Failed to update transcription log');
      }

      return new Response(
        JSON.stringify({
          text: result.text,
          logId: logId,
          language: 'en', // Translations are always to English
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );

    } catch (error) {
      console.error('Translation error:', error);

      // Update log with error
      await supabase
        .from('transcription_logs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', logId);

      throw error;
    }

  } catch (error) {
    console.error('Error in translate-audio function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});