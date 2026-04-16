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
      departments: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          name: string
          vendor: string | null
          category: string
          amount_ngn: number
          billing_cycle: string
          next_renewal_date: string
          last_renewed_at: string | null
          owner_id: string | null
          department_id: string | null
          status: string
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          vendor?: string | null
          category?: string
          amount_ngn?: number
          billing_cycle?: string
          next_renewal_date: string
          last_renewed_at?: string | null
          owner_id?: string | null
          department_id?: string | null
          status?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          vendor?: string | null
          category?: string
          amount_ngn?: number
          billing_cycle?: string
          next_renewal_date?: string
          last_renewed_at?: string | null
          owner_id?: string | null
          department_id?: string | null
          status?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          name: string
          period_start: string
          period_end: string
          department_id: string | null
          total_amount_ngn: number
          status: string
          notes: string | null
          created_by: string | null
          approved_by: string | null
          rejection_reason: string | null
          locked: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          period_start: string
          period_end: string
          department_id?: string | null
          total_amount_ngn?: number
          status?: string
          notes?: string | null
          created_by?: string | null
          approved_by?: string | null
          rejection_reason?: string | null
          locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          period_start?: string
          period_end?: string
          department_id?: string | null
          total_amount_ngn?: number
          status?: string
          notes?: string | null
          created_by?: string | null
          approved_by?: string | null
          rejection_reason?: string | null
          locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          id: string
          budget_id: string
          category: string
          description: string | null
          planned_amount_ngn: number
          created_at: string
        }
        Insert: {
          id?: string
          budget_id: string
          category: string
          description?: string | null
          planned_amount_ngn?: number
          created_at?: string
        }
        Update: {
          id?: string
          budget_id?: string
          category?: string
          description?: string | null
          planned_amount_ngn?: number
          created_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          title: string
          category: string
          storage_path: string
          mime_type: string | null
          file_size_bytes: number | null
          expires_at: string | null
          description: string | null
          tags: string[] | null
          department_id: string | null
          uploaded_by: string | null
          visible_to_roles: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          category?: string
          storage_path: string
          mime_type?: string | null
          file_size_bytes?: number | null
          expires_at?: string | null
          description?: string | null
          tags?: string[] | null
          department_id?: string | null
          uploaded_by?: string | null
          visible_to_roles?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          category?: string
          storage_path?: string
          mime_type?: string | null
          file_size_bytes?: number | null
          expires_at?: string | null
          description?: string | null
          tags?: string[] | null
          department_id?: string | null
          uploaded_by?: string | null
          visible_to_roles?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          id: string
          employee_id: string
          leave_type: string
          start_date: string
          end_date: string
          days_requested: number
          reason: string | null
          status: string
          reviewed_by: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          leave_type: string
          start_date: string
          end_date: string
          days_requested: number
          reason?: string | null
          status?: string
          reviewed_by?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          leave_type?: string
          start_date?: string
          end_date?: string
          days_requested?: number
          reason?: string | null
          status?: string
          reviewed_by?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          id: string
          employee_id: string
          year: number
          annual_quota: number
          annual_used: number
          sick_used: number
          unpaid_used: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          year: number
          annual_quota?: number
          annual_used?: number
          sick_used?: number
          unpaid_used?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          year?: number
          annual_quota?: number
          annual_used?: number
          sick_used?: number
          unpaid_used?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string | null
          description: string
          id: string
          performed_by: string | null
          performed_by_name: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description: string
          id?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string
          id?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_items: {
        Row: {
          account_number: string
          amount_ngn: number
          bank_name: string
          batch_id: string
          contractor_id: string | null
          created_at: string
          failure_reason: string | null
          full_name: string
          id: string
          reference: string | null
          status: string
        }
        Insert: {
          account_number?: string
          amount_ngn?: number
          bank_name?: string
          batch_id: string
          contractor_id?: string | null
          created_at?: string
          failure_reason?: string | null
          full_name: string
          id?: string
          reference?: string | null
          status?: string
        }
        Update: {
          account_number?: string
          amount_ngn?: number
          bank_name?: string
          batch_id?: string
          contractor_id?: string | null
          created_at?: string
          failure_reason?: string | null
          full_name?: string
          id?: string
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_items_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          account_number: string
          bank_name: string
          created_at: string
          default_amount_ngn: number
          full_name: string
          id: string
          linkedin_id: string | null
          status: string
        }
        Insert: {
          account_number?: string
          bank_name?: string
          created_at?: string
          default_amount_ngn?: number
          full_name: string
          id?: string
          linkedin_id?: string | null
          status?: string
        }
        Update: {
          account_number?: string
          bank_name?: string
          created_at?: string
          default_amount_ngn?: number
          full_name?: string
          id?: string
          linkedin_id?: string | null
          status?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          admin_note: string | null
          amount_ngn: number
          budget_category: string | null
          category: string
          created_at: string
          date: string
          description: string | null
          id: string
          mileage_km: number | null
          rate_per_km_ngn: number | null
          receipt_url: string | null
          status: string
          submitted_by: string
        }
        Insert: {
          admin_note?: string | null
          amount_ngn?: number
          budget_category?: string | null
          category: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          mileage_km?: number | null
          rate_per_km_ngn?: number | null
          receipt_url?: string | null
          status?: string
          submitted_by: string
        }
        Update: {
          admin_note?: string | null
          amount_ngn?: number
          budget_category?: string | null
          category?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          mileage_km?: number | null
          rate_per_km_ngn?: number | null
          receipt_url?: string | null
          status?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_requests: {
        Row: {
          admin_note: string | null
          amount_ngn: number
          created_at: string
          driver_id: string
          id: string
          litres_est: number | null
          odometer: number | null
          reason: string | null
          station_name: string
          status: string
          vehicle_id: string | null
        }
        Insert: {
          admin_note?: string | null
          amount_ngn?: number
          created_at?: string
          driver_id: string
          id?: string
          litres_est?: number | null
          odometer?: number | null
          reason?: string | null
          station_name?: string
          status?: string
          vehicle_id?: string | null
        }
        Update: {
          admin_note?: string | null
          amount_ngn?: number
          created_at?: string
          driver_id?: string
          id?: string
          litres_est?: number | null
          odometer?: number | null
          reason?: string | null
          station_name?: string
          status?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_batches: {
        Row: {
          approved_by: string | null
          beneficiary_count: number
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          payment_date: string
          period: string | null
          rejection_reason: string | null
          scheduled_date: string | null
          status: string
          total_amount: number
        }
        Insert: {
          approved_by?: string | null
          beneficiary_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_date: string
          period?: string | null
          rejection_reason?: string | null
          scheduled_date?: string | null
          status?: string
          total_amount?: number
        }
        Update: {
          approved_by?: string | null
          beneficiary_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_date?: string
          period?: string | null
          rejection_reason?: string | null
          scheduled_date?: string | null
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          role: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          phone?: string | null
          role?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: string
          status?: string
        }
        Relationships: []
      }
      trip_logs: {
        Row: {
          created_at: string
          date: string
          driver_id: string
          end_location: string
          fuel_amount_ngn: number | null
          id: string
          issues: string | null
          km_driven: number | null
          litres: number | null
          odometer_end: number | null
          odometer_start: number | null
          receipt_url: string | null
          start_location: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          driver_id: string
          end_location?: string
          fuel_amount_ngn?: number | null
          id?: string
          issues?: string | null
          km_driven?: number | null
          litres?: number | null
          odometer_end?: number | null
          odometer_start?: number | null
          receipt_url?: string | null
          start_location?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          driver_id?: string
          end_location?: string
          fuel_amount_ngn?: number | null
          id?: string
          issues?: string | null
          km_driven?: number | null
          litres?: number | null
          odometer_end?: number | null
          odometer_start?: number | null
          receipt_url?: string | null
          start_location?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_driver_id: string | null
          created_at: string
          id: string
          make_model: string | null
          name: string
          plate_number: string
          status: string
          weekly_budget_ngn: number
        }
        Insert: {
          assigned_driver_id?: string | null
          created_at?: string
          id?: string
          make_model?: string | null
          name: string
          plate_number: string
          status?: string
          weekly_budget_ngn?: number
        }
        Update: {
          assigned_driver_id?: string | null
          created_at?: string
          id?: string
          make_model?: string | null
          name?: string
          plate_number?: string
          status?: string
          weekly_budget_ngn?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
