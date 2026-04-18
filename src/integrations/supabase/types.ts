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
      answer_sheets: {
        Row: {
          generated_at: string
          id: string
          pdf_url: string | null
          sheet_uuid: string
          status: string
          student_id: string
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          pdf_url?: string | null
          sheet_uuid?: string
          status?: string
          student_id: string
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          pdf_url?: string | null
          sheet_uuid?: string
          status?: string
          student_id?: string
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      corrections: {
        Row: {
          created_at: string | null
          essay_score: number | null
          id: string
          max_score: number | null
          percentage: number | null
          status: string
          student_id: string | null
          student_name: string
          template_id: string
          total_score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          essay_score?: number | null
          id?: string
          max_score?: number | null
          percentage?: number | null
          status?: string
          student_id?: string | null
          student_name: string
          template_id: string
          total_score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          essay_score?: number | null
          id?: string
          max_score?: number | null
          percentage?: number | null
          status?: string
          student_id?: string | null
          student_name?: string
          template_id?: string
          total_score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      discipline_topics: {
        Row: {
          created_at: string | null
          discipline_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          discipline_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          discipline_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "discipline_topics_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplines: {
        Row: {
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          role?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scan_submissions: {
        Row: {
          answer_sheet_id: string | null
          correction_id: string | null
          created_at: string
          detected_answers: Json
          discarded: boolean
          id: string
          manual_corrections: Json | null
          qr_data: Json | null
          read_errors: string[] | null
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          scan_image_path: string
          student_id: string | null
          success: boolean
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_sheet_id?: string | null
          correction_id?: string | null
          created_at?: string
          detected_answers?: Json
          discarded?: boolean
          id?: string
          manual_corrections?: Json | null
          qr_data?: Json | null
          read_errors?: string[] | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_image_path: string
          student_id?: string | null
          success?: boolean
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_sheet_id?: string | null
          correction_id?: string | null
          created_at?: string
          detected_answers?: Json
          discarded?: boolean
          id?: string
          manual_corrections?: Json | null
          qr_data?: Json | null
          read_errors?: string[] | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_image_path?: string
          student_id?: string | null
          success?: boolean
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_answers: {
        Row: {
          correct_answer: string
          correction_id: string
          created_at: string | null
          id: string
          is_correct: boolean | null
          points_earned: number | null
          question_number: number
          student_answer: string | null
        }
        Insert: {
          correct_answer: string
          correction_id: string
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          question_number: number
          student_answer?: string | null
        }
        Update: {
          correct_answer?: string
          correction_id?: string
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          question_number?: number
          student_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_answers_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "corrections"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          campus: string | null
          created_at: string
          email: string | null
          foreign_language: string | null
          id: string
          name: string
          student_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campus?: string | null
          created_at?: string
          email?: string | null
          foreign_language?: string | null
          id?: string
          name: string
          student_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campus?: string | null
          created_at?: string
          email?: string | null
          foreign_language?: string | null
          id?: string
          name?: string
          student_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      template_questions: {
        Row: {
          correct_answer: string
          created_at: string | null
          id: string
          language_variant: string | null
          num_propositions: number | null
          points: number | null
          question_number: number
          question_type: string
          subject: string | null
          template_id: string
          topic: string | null
        }
        Insert: {
          correct_answer: string
          created_at?: string | null
          id?: string
          language_variant?: string | null
          num_propositions?: number | null
          points?: number | null
          question_number: number
          question_type?: string
          subject?: string | null
          template_id: string
          topic?: string | null
        }
        Update: {
          correct_answer?: string
          created_at?: string | null
          id?: string
          language_variant?: string | null
          num_propositions?: number | null
          points?: number | null
          question_number?: number
          question_type?: string
          subject?: string | null
          template_id?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_students: {
        Row: {
          created_at: string
          id: string
          student_id: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          student_id: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          student_id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          created_at: string | null
          description: string | null
          exam_type: string
          id: string
          name: string
          total_questions: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          exam_type: string
          id?: string
          name: string
          total_questions: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          exam_type?: string
          id?: string
          name?: string
          total_questions?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
