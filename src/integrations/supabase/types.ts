export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_description: string
          action_type: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_description: string
          action_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_description?: string
          action_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          created_at: string
          description: string
          file_path: string | null
          id: string
          job_time: string
          job_type: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          file_path?: string | null
          id?: string
          job_time?: string
          job_type: string
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          file_path?: string | null
          id?: string
          job_time?: string
          job_type?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      backup_retention_settings: {
        Row: {
          auto_cleanup_enabled: boolean
          created_at: string
          id: string
          retention_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_cleanup_enabled?: boolean
          created_at?: string
          id?: string
          retention_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_cleanup_enabled?: boolean
          created_at?: string
          id?: string
          retention_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      duplicate_cleanup_config: {
        Row: {
          created_at: string
          delete_older_than_days: number
          enabled: boolean
          id: string
          keep_latest: boolean
          run_schedule: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delete_older_than_days?: number
          enabled?: boolean
          id?: string
          keep_latest?: boolean
          run_schedule?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delete_older_than_days?: number
          enabled?: boolean
          id?: string
          keep_latest?: boolean
          run_schedule?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      duplicate_cleanup_history: {
        Row: {
          error_message: string | null
          files_deleted: number
          id: string
          run_at: string
          space_freed_bytes: number
          status: string
          user_id: string
        }
        Insert: {
          error_message?: string | null
          files_deleted?: number
          id?: string
          run_at?: string
          space_freed_bytes?: number
          status?: string
          user_id: string
        }
        Update: {
          error_message?: string | null
          files_deleted?: number
          id?: string
          run_at?: string
          space_freed_bytes?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      filter_presets: {
        Row: {
          clone_count: number
          created_at: string
          description: string | null
          filter_data: Json
          id: string
          is_shared: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clone_count?: number
          created_at?: string
          description?: string | null
          filter_data: Json
          id?: string
          is_shared?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clone_count?: number
          created_at?: string
          description?: string | null
          filter_data?: Json
          id?: string
          is_shared?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_duplicate_detected: boolean
          email_transcription_complete: boolean
          email_transcription_failed: boolean
          email_weekly_summary: boolean
          id: string
          inapp_duplicate_detected: boolean
          inapp_system_updates: boolean
          inapp_transcription_complete: boolean
          inapp_transcription_failed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_duplicate_detected?: boolean
          email_transcription_complete?: boolean
          email_transcription_failed?: boolean
          email_weekly_summary?: boolean
          id?: string
          inapp_duplicate_detected?: boolean
          inapp_system_updates?: boolean
          inapp_transcription_complete?: boolean
          inapp_transcription_failed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_duplicate_detected?: boolean
          email_transcription_complete?: boolean
          email_transcription_failed?: boolean
          email_weekly_summary?: boolean
          id?: string
          inapp_duplicate_detected?: boolean
          inapp_system_updates?: boolean
          inapp_transcription_complete?: boolean
          inapp_transcription_failed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      preset_backups: {
        Row: {
          backed_up_at: string
          backup_reason: string
          created_at: string
          id: string
          original_preset_id: string | null
          preset_description: string | null
          preset_filter_data: Json
          preset_name: string
          user_id: string
        }
        Insert: {
          backed_up_at?: string
          backup_reason?: string
          created_at?: string
          id?: string
          original_preset_id?: string | null
          preset_description?: string | null
          preset_filter_data: Json
          preset_name: string
          user_id: string
        }
        Update: {
          backed_up_at?: string
          backup_reason?: string
          created_at?: string
          id?: string
          original_preset_id?: string | null
          preset_description?: string | null
          preset_filter_data?: Json
          preset_name?: string
          user_id?: string
        }
        Relationships: []
      }
      preset_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          preset_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          preset_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          preset_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preset_comments_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "filter_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      preset_ratings: {
        Row: {
          created_at: string
          id: string
          preset_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preset_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preset_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preset_ratings_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "filter_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      preset_usage: {
        Row: {
          created_at: string
          event_type: string
          id: string
          preset_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          preset_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          preset_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preset_usage_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "filter_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      preset_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string
          description: string | null
          filter_data: Json
          id: string
          name: string
          preset_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          filter_data: Json
          id?: string
          name: string
          preset_id: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          filter_data?: Json
          id?: string
          name?: string
          preset_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "preset_versions_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "filter_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          must_change_password: boolean | null
          updated_at: string
          user_group: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          must_change_password?: boolean | null
          updated_at?: string
          user_group: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          must_change_password?: boolean | null
          updated_at?: string
          user_group?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          body: string
          created_at: string
          status: string
          subject: string
          ticket_id: string
          updated_at: string
          user_email: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          status?: string
          subject: string
          ticket_id: string
          updated_at?: string
          user_email: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          status?: string
          subject?: string
          ticket_id?: string
          updated_at?: string
          user_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tag_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tag_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          category_id: string | null
          color: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tag_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      template_tags: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_tags_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tag_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_logs: {
        Row: {
          created_at: string
          error_message: string | null
          file_checksum: string | null
          file_path: string | null
          file_title: string
          id: string
          is_protected: boolean
          log_time: string
          status: string
          transcription_text: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_checksum?: string | null
          file_path?: string | null
          file_title: string
          id?: string
          is_protected?: boolean
          log_time?: string
          status: string
          transcription_text?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_checksum?: string | null
          file_path?: string | null
          file_title?: string
          id?: string
          is_protected?: boolean
          log_time?: string
          status?: string
          transcription_text?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      transcription_queue: {
        Row: {
          channel_title: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          language: string | null
          progress: number | null
          result_duration: number | null
          result_language: string | null
          result_text: string | null
          started_at: string | null
          status: string
          transcription_log_id: string | null
          updated_at: string | null
          user_id: string
          video_id: string
          video_thumbnail: string | null
          video_title: string
          video_url: string
        }
        Insert: {
          channel_title?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          language?: string | null
          progress?: number | null
          result_duration?: number | null
          result_language?: string | null
          result_text?: string | null
          started_at?: string | null
          status?: string
          transcription_log_id?: string | null
          updated_at?: string | null
          user_id: string
          video_id: string
          video_thumbnail?: string | null
          video_title: string
          video_url: string
        }
        Update: {
          channel_title?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          language?: string | null
          progress?: number | null
          result_duration?: number | null
          result_language?: string | null
          result_text?: string | null
          started_at?: string | null
          status?: string
          transcription_log_id?: string | null
          updated_at?: string | null
          user_id?: string
          video_id?: string
          video_thumbnail?: string | null
          video_title?: string
          video_url?: string
        }
        Relationships: []
      }
      transcription_tags: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          transcription_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          transcription_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          transcription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcription_tags_transcription_id_fkey"
            columns: ["transcription_id"]
            isOneToOne: false
            referencedRelation: "transcription_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_user_activity: {
        Args: {
          p_action_description: string
          p_action_type: string
          p_metadata?: Json
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
