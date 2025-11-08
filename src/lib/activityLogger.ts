import { supabase } from "@/integrations/supabase/client";

interface LogActivityParams {
  actionType: string;
  actionDescription: string;
  metadata?: Record<string, any>;
}

export const logActivity = async ({
  actionType,
  actionDescription,
  metadata,
}: LogActivityParams): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("activity_logs").insert({
      user_id: user.id,
      action_type: actionType,
      action_description: actionDescription,
      metadata: metadata || null,
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
};

// Pre-defined activity logging functions
export const logLogin = async () => {
  await logActivity({
    actionType: "login",
    actionDescription: "User logged in",
  });
};

export const logTranscription = async (filename: string, status: string) => {
  await logActivity({
    actionType: "transcription",
    actionDescription: `Transcription ${status}: ${filename}`,
    metadata: { filename, status },
  });
};

export const logUpload = async (filename: string, type: string) => {
  await logActivity({
    actionType: "upload",
    actionDescription: `Uploaded ${type}: ${filename}`,
    metadata: { filename, type },
  });
};

export const logSettingsChange = async (setting: string) => {
  await logActivity({
    actionType: "settings",
    actionDescription: `Updated ${setting}`,
    metadata: { setting },
  });
};

export const logProfileUpdate = async (fields: string[]) => {
  await logActivity({
    actionType: "settings",
    actionDescription: `Updated profile: ${fields.join(", ")}`,
    metadata: { fields },
  });
};

export const logPasswordChange = async () => {
  await logActivity({
    actionType: "settings",
    actionDescription: "Changed password",
  });
};
