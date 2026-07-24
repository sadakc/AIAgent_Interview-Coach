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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      interview_session_state: {
        Row: {
          current_question_index: number
          elapsed_seconds: number
          follow_up_count: number
          question_plan: Json
          session_id: string
          turn_state: Database["public"]["Enums"]["turn_state"]
          updated_at: string
        }
        Insert: {
          current_question_index?: number
          elapsed_seconds?: number
          follow_up_count?: number
          question_plan?: Json
          session_id: string
          turn_state?: Database["public"]["Enums"]["turn_state"]
          updated_at?: string
        }
        Update: {
          current_question_index?: number
          elapsed_seconds?: number
          follow_up_count?: number
          question_plan?: Json
          session_id?: string
          turn_state?: Database["public"]["Enums"]["turn_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_session_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          created_at: string
          duration_minutes: number
          ended_at: string | null
          id: string
          job_description_parsed: Json | null
          job_description_raw: string
          role_title: string | null
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          ended_at?: string | null
          id?: string
          job_description_parsed?: Json | null
          job_description_raw: string
          role_title?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          id?: string
          job_description_parsed?: Json | null
          job_description_raw?: string
          role_title?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          font_scale: number
          id: string
          phone: string | null
          push_to_talk_default: boolean
          theme_preference: Database["public"]["Enums"]["theme_preference"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          font_scale?: number
          id: string
          phone?: string | null
          push_to_talk_default?: boolean
          theme_preference?: Database["public"]["Enums"]["theme_preference"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          font_scale?: number
          id?: string
          phone?: string | null
          push_to_talk_default?: boolean
          theme_preference?: Database["public"]["Enums"]["theme_preference"]
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          communication_score: number
          created_at: string
          id: string
          overall_score: number
          per_question_scores: Json
          session_id: string
          suggested_answers: Json
          top_improvements: Json
        }
        Insert: {
          communication_score: number
          created_at?: string
          id?: string
          overall_score: number
          per_question_scores?: Json
          session_id: string
          suggested_answers?: Json
          top_improvements?: Json
        }
        Update: {
          communication_score?: number
          created_at?: string
          id?: string
          overall_score?: number
          per_question_scores?: Json
          session_id?: string
          suggested_answers?: Json
          top_improvements?: Json
        }
        Relationships: [
          {
            foreignKeyName: "reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      turns: {
        Row: {
          audio_ref: string | null
          created_at: string
          id: string
          question_index: number | null
          sequence_number: number
          session_id: string
          text: string
          type: Database["public"]["Enums"]["turn_type"]
        }
        Insert: {
          audio_ref?: string | null
          created_at?: string
          id?: string
          question_index?: number | null
          sequence_number: number
          session_id: string
          text: string
          type: Database["public"]["Enums"]["turn_type"]
        }
        Update: {
          audio_ref?: string | null
          created_at?: string
          id?: string
          question_index?: number | null
          sequence_number?: number
          session_id?: string
          text?: string
          type?: Database["public"]["Enums"]["turn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      session_status: "in_progress" | "completed" | "abandoned"
      theme_preference: "light" | "dark" | "system"
      turn_state: "idle" | "listening" | "thinking" | "speaking" | "ended"
      turn_type: "question" | "follow_up" | "answer"
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
      session_status: ["in_progress", "completed", "abandoned"],
      theme_preference: ["light", "dark", "system"],
      turn_state: ["idle", "listening", "thinking", "speaking", "ended"],
      turn_type: ["question", "follow_up", "answer"],
    },
  },
} as const
