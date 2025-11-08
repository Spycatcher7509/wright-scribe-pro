import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ErrorStat {
  error: string;
  count: number;
  percentage: number;
}

interface TranscriptionStats {
  total: number;
  failed: number;
  errorRate: number;
  recentErrors: ErrorStat[];
  timeWindow: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting transcription error monitoring...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Configuration
    const ERROR_THRESHOLD = 15; // Alert if error rate exceeds 15%
    const TIME_WINDOW_HOURS = 24; // Check last 24 hours
    const MIN_TRANSCRIPTIONS = 5; // Minimum transcriptions before alerting

    // Calculate time window
    const timeWindowStart = new Date();
    timeWindowStart.setHours(timeWindowStart.getHours() - TIME_WINDOW_HOURS);

    // Fetch recent transcription logs
    const { data: recentLogs, error: logsError } = await supabase
      .from("transcription_logs")
      .select("status, error_message, created_at")
      .gte("created_at", timeWindowStart.toISOString())
      .order("created_at", { ascending: false });

    if (logsError) {
      console.error("Error fetching logs:", logsError);
      throw logsError;
    }

    const total = recentLogs?.length || 0;

    // Don't alert if insufficient data
    if (total < MIN_TRANSCRIPTIONS) {
      console.log(`Insufficient data: ${total} transcriptions (minimum: ${MIN_TRANSCRIPTIONS})`);
      return new Response(
        JSON.stringify({ 
          message: "Insufficient data for monitoring",
          stats: { total, threshold: MIN_TRANSCRIPTIONS }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate error statistics
    const failed = recentLogs?.filter(log => log.status === "failed").length || 0;
    const errorRate = total > 0 ? (failed / total) * 100 : 0;

    console.log(`Stats - Total: ${total}, Failed: ${failed}, Error Rate: ${errorRate.toFixed(2)}%`);

    // Only proceed if error rate exceeds threshold
    if (errorRate < ERROR_THRESHOLD) {
      console.log(`Error rate ${errorRate.toFixed(2)}% is below threshold ${ERROR_THRESHOLD}%`);
      return new Response(
        JSON.stringify({ 
          message: "Error rate within acceptable range",
          stats: { total, failed, errorRate: errorRate.toFixed(2), threshold: ERROR_THRESHOLD }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze error types
    const failedLogs = recentLogs?.filter(log => log.status === "failed" && log.error_message) || [];
    const errorMap = new Map<string, number>();

    failedLogs.forEach(log => {
      const error = log.error_message || "Unknown error";
      const shortError = error.length > 100 ? error.substring(0, 100) + "..." : error;
      errorMap.set(shortError, (errorMap.get(shortError) || 0) + 1);
    });

    const recentErrors: ErrorStat[] = Array.from(errorMap.entries())
      .map(([error, count]) => ({
        error,
        count,
        percentage: (count / failed) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const stats: TranscriptionStats = {
      total,
      failed,
      errorRate: parseFloat(errorRate.toFixed(2)),
      recentErrors,
      timeWindow: `Last ${TIME_WINDOW_HOURS} hours`
    };

    // Get all admin users
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError || !adminRoles || adminRoles.length === 0) {
      console.error("Error fetching admin roles or no admins found:", rolesError);
      return new Response(
        JSON.stringify({ 
          message: "Alert triggered but no admin users found",
          stats 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin emails
    const adminUserIds = adminRoles.map(role => role.user_id);
    const { data: adminProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email")
      .in("id", adminUserIds);

    if (profilesError || !adminProfiles || adminProfiles.length === 0) {
      console.error("Error fetching admin profiles:", profilesError);
      throw new Error("No admin emails found");
    }

    const adminEmails = adminProfiles.map(profile => profile.email);
    console.log(`Sending alerts to ${adminEmails.length} admin(s)`);

    // Build error summary HTML
    const errorListHTML = recentErrors
      .map(stat => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 13px;">
              ${stat.error}
            </code>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
            <strong>${stat.count}</strong>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
            ${stat.percentage.toFixed(1)}%
          </td>
        </tr>
      `)
      .join("");

    const emailHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Transcription Error Alert</h1>
            </div>

            <!-- Content -->
            <div style="padding: 30px 20px;">
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
                <p style="margin: 0; color: #991b1b; font-weight: 600;">
                  High Error Rate Detected: ${errorRate.toFixed(2)}%
                </p>
                <p style="margin: 8px 0 0 0; color: #7f1d1d; font-size: 14px;">
                  Threshold: ${ERROR_THRESHOLD}% | Time Window: ${TIME_WINDOW_HOURS} hours
                </p>
              </div>

              <h2 style="color: #111827; font-size: 18px; margin: 0 0 16px 0;">Summary Statistics</h2>
              <div style="display: grid; gap: 12px; margin-bottom: 24px;">
                <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; border: 1px solid #e5e7eb;">
                  <div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Total Transcriptions</div>
                  <div style="color: #111827; font-size: 24px; font-weight: bold;">${total}</div>
                </div>
                <div style="background-color: #fef2f2; padding: 16px; border-radius: 6px; border: 1px solid #fee2e2;">
                  <div style="color: #991b1b; font-size: 14px; margin-bottom: 4px;">Failed Transcriptions</div>
                  <div style="color: #dc2626; font-size: 24px; font-weight: bold;">${failed}</div>
                </div>
                <div style="background-color: #fef9f5; padding: 16px; border-radius: 6px; border: 1px solid #fed7aa;">
                  <div style="color: #92400e; font-size: 14px; margin-bottom: 4px;">Error Rate</div>
                  <div style="color: #ea580c; font-size: 24px; font-weight: bold;">${errorRate.toFixed(2)}%</div>
                </div>
              </div>

              <h2 style="color: #111827; font-size: 18px; margin: 0 0 16px 0;">Top Error Types</h2>
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; background-color: white; border: 1px solid #e5e7eb; border-radius: 6px;">
                  <thead>
                    <tr style="background-color: #f9fafb;">
                      <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Error Message</th>
                      <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Count</th>
                      <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">% of Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${errorListHTML}
                  </tbody>
                </table>
              </div>

              <div style="margin-top: 24px; padding: 16px; background-color: #eff6ff; border-radius: 6px; border: 1px solid #dbeafe;">
                <p style="margin: 0; color: #1e40af; font-size: 14px;">
                  💡 <strong>Action Required:</strong> Please review the error patterns and investigate the root causes. 
                  Check the admin analytics dashboard for more detailed information.
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                This is an automated alert from The Wright Scriber Pro
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
                Generated: ${new Date().toLocaleString('en-GB', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send emails to all admins
    const emailPromises = adminEmails.map(email =>
      resend.emails.send({
        from: "Wright Scriber Pro <onboarding@resend.dev>",
        to: [email],
        subject: `⚠️ Transcription Error Alert: ${errorRate.toFixed(2)}% Error Rate`,
        html: emailHTML,
      })
    );

    const emailResults = await Promise.allSettled(emailPromises);
    
    const successCount = emailResults.filter(r => r.status === "fulfilled").length;
    const failureCount = emailResults.filter(r => r.status === "rejected").length;

    console.log(`Emails sent - Success: ${successCount}, Failed: ${failureCount}`);

    // Log any email failures
    emailResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Failed to send email to ${adminEmails[index]}:`, result.reason);
      }
    });

    return new Response(
      JSON.stringify({
        message: "Error alert sent to admins",
        stats,
        emailsSent: successCount,
        emailsFailed: failureCount,
        recipients: adminEmails
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Error in monitor-transcription-errors function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
