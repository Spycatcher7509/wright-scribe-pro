import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Bell, Mail, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface NotificationPreferences {
  email_transcription_complete: boolean;
  email_transcription_failed: boolean;
  email_duplicate_detected: boolean;
  email_weekly_summary: boolean;
  inapp_transcription_complete: boolean;
  inapp_transcription_failed: boolean;
  inapp_duplicate_detected: boolean;
  inapp_system_updates: boolean;
}

const NotificationSettings = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Check authentication
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      }
    });
  }, [navigate]);

  // Fetch preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      // If no preferences exist, create default ones
      if (!data) {
        const { data: newPrefs, error: insertError } = await supabase
          .from("notification_preferences")
          .insert({
            user_id: user.id,
            email_transcription_complete: true,
            email_transcription_failed: true,
            email_duplicate_detected: false,
            email_weekly_summary: false,
            inapp_transcription_complete: true,
            inapp_transcription_failed: true,
            inapp_duplicate_detected: true,
            inapp_system_updates: true,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        return newPrefs;
      }

      return data;
    },
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("notification_preferences")
        .update(updates)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Preferences updated");
    },
    onError: (error: any) => {
      toast.error("Failed to update preferences: " + error.message);
    },
  });

  const handleToggle = (key: keyof NotificationPreferences, value: boolean) => {
    updatePreferencesMutation.mutate({ [key]: value });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="max-w-3xl mx-auto pt-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/profile")}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Profile
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>
                  Manage how you receive notifications
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email Notifications */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Email Notifications</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-complete">Transcription Complete</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when your transcription is ready
                    </p>
                  </div>
                  <Switch
                    id="email-complete"
                    checked={preferences?.email_transcription_complete ?? true}
                    onCheckedChange={(checked) =>
                      handleToggle("email_transcription_complete", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-failed">Transcription Failed</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified if a transcription fails
                    </p>
                  </div>
                  <Switch
                    id="email-failed"
                    checked={preferences?.email_transcription_failed ?? true}
                    onCheckedChange={(checked) =>
                      handleToggle("email_transcription_failed", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-duplicate">Duplicate Detected</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when duplicate files are detected
                    </p>
                  </div>
                  <Switch
                    id="email-duplicate"
                    checked={preferences?.email_duplicate_detected ?? false}
                    onCheckedChange={(checked) =>
                      handleToggle("email_duplicate_detected", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-summary">Weekly Summary</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive a weekly summary of your activity
                    </p>
                  </div>
                  <Switch
                    id="email-summary"
                    checked={preferences?.email_weekly_summary ?? false}
                    onCheckedChange={(checked) =>
                      handleToggle("email_weekly_summary", checked)
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* In-App Notifications */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">In-App Notifications</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="inapp-complete">Transcription Complete</Label>
                    <p className="text-sm text-muted-foreground">
                      Show toast notifications when transcription is ready
                    </p>
                  </div>
                  <Switch
                    id="inapp-complete"
                    checked={preferences?.inapp_transcription_complete ?? true}
                    onCheckedChange={(checked) =>
                      handleToggle("inapp_transcription_complete", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="inapp-failed">Transcription Failed</Label>
                    <p className="text-sm text-muted-foreground">
                      Show notifications for failed transcriptions
                    </p>
                  </div>
                  <Switch
                    id="inapp-failed"
                    checked={preferences?.inapp_transcription_failed ?? true}
                    onCheckedChange={(checked) =>
                      handleToggle("inapp_transcription_failed", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="inapp-duplicate">Duplicate Detected</Label>
                    <p className="text-sm text-muted-foreground">
                      Show notifications when duplicates are found
                    </p>
                  </div>
                  <Switch
                    id="inapp-duplicate"
                    checked={preferences?.inapp_duplicate_detected ?? true}
                    onCheckedChange={(checked) =>
                      handleToggle("inapp_duplicate_detected", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="inapp-updates">System Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Show notifications about system updates and features
                    </p>
                  </div>
                  <Switch
                    id="inapp-updates"
                    checked={preferences?.inapp_system_updates ?? true}
                    onCheckedChange={(checked) =>
                      handleToggle("inapp_system_updates", checked)
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NotificationSettings;
