import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileAudio, Settings, Shield, LogIn, Upload, Activity } from "lucide-react";

interface ActivityLog {
  id: string;
  action_type: string;
  action_description: string;
  metadata: any;
  created_at: string;
  user_id: string;
}

interface RealtimeNotificationsContextType {
  recentActivities: ActivityLog[];
  unreadCount: number;
  markAsRead: () => void;
}

const RealtimeNotificationsContext = createContext<RealtimeNotificationsContextType | undefined>(undefined);

const getActivityIcon = (actionType: string) => {
  switch (actionType) {
    case "login":
      return LogIn;
    case "transcription":
      return FileAudio;
    case "upload":
      return Upload;
    case "settings":
      return Settings;
    case "admin":
      return Shield;
    default:
      return Activity;
  }
};

export const RealtimeNotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [recentActivities, setRecentActivities] = useState<ActivityLog[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let userId: string | null = null;

    // Get current user
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        
        // Fetch initial recent activities
        const { data } = await supabase
          .from("activity_logs")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (data) {
          setRecentActivities(data);
        }
      }
    };

    initUser();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('activity-logs-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: userId ? `user_id=eq.${userId}` : undefined,
        },
        (payload) => {
          const newActivity = payload.new as ActivityLog;
          
          // Only show notification if it's for the current user
          if (userId && newActivity.user_id === userId) {
            // Add to recent activities
            setRecentActivities((prev) => [newActivity, ...prev.slice(0, 9)]);
            setUnreadCount((prev) => prev + 1);

            // Show toast notification
            const Icon = getActivityIcon(newActivity.action_type);
            toast(newActivity.action_description, {
              icon: <Icon className="h-4 w-4" />,
              description: new Date(newActivity.created_at).toLocaleString(),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markAsRead = () => {
    setUnreadCount(0);
  };

  return (
    <RealtimeNotificationsContext.Provider value={{ recentActivities, unreadCount, markAsRead }}>
      {children}
    </RealtimeNotificationsContext.Provider>
  );
};

export const useRealtimeNotifications = () => {
  const context = useContext(RealtimeNotificationsContext);
  if (!context) {
    throw new Error("useRealtimeNotifications must be used within RealtimeNotificationsProvider");
  }
  return context;
};
