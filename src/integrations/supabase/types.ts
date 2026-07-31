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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      advance_requests: {
        Row: {
          advance_id: string | null
          amount_ngn: number
          created_at: string
          employee_id: string
          id: string
          reason: string | null
          rejection_reason: string | null
          repayment_months: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          advance_id?: string | null
          amount_ngn: number
          created_at?: string
          employee_id: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          repayment_months?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          advance_id?: string | null
          amount_ngn?: number
          created_at?: string
          employee_id?: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          repayment_months?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "advance_requests_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "employee_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "advance_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "advance_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "advance_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "advance_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string | null
          created_at: string
          dismissed_by_ids: string[]
          expires_at: string | null
          id: string
          posted_by: string | null
          title: string
          tone: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dismissed_by_ids?: string[]
          expires_at?: string | null
          id?: string
          posted_by?: string | null
          title: string
          tone?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dismissed_by_ids?: string[]
          expires_at?: string | null
          id?: string
          posted_by?: string | null
          title?: string
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcements_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "announcements_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_comments: {
        Row: {
          action: string
          author_id: string | null
          author_name: string | null
          body: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          author_id?: string | null
          author_name?: string | null
          body?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          author_id?: string | null
          author_name?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "approval_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "approval_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_limits: {
        Row: {
          max_approve_ngn: number
          role: string
          updated_at: string | null
        }
        Insert: {
          max_approve_ngn: number
          role: string
          updated_at?: string | null
        }
        Update: {
          max_approve_ngn?: number
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      approver_pools: {
        Row: {
          action_type: string
          created_at: string
          eligible_roles: Json
          id: string
          tier: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          eligible_roles: Json
          id?: string
          tier: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          eligible_roles?: Json
          id?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          annual_allowance_rate: number
          asset_number: string
          assigned_to: string | null
          category: string
          cost_ngn: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          depreciation_method: string
          description: string | null
          disposal_date: string | null
          disposal_notes: string | null
          disposal_proceeds_ngn: number | null
          id: string
          initial_allowance_rate: number
          insurance_expiry: string | null
          insurance_policy_number: string | null
          insurance_value_ngn: number | null
          insurer: string | null
          location: string | null
          name: string
          notes: string | null
          purchase_date: string
          salvage_value_ngn: number
          status: string
          updated_at: string
          useful_life_years: number
        }
        Insert: {
          annual_allowance_rate?: number
          asset_number: string
          assigned_to?: string | null
          category: string
          cost_ngn: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          depreciation_method?: string
          description?: string | null
          disposal_date?: string | null
          disposal_notes?: string | null
          disposal_proceeds_ngn?: number | null
          id?: string
          initial_allowance_rate?: number
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          insurance_value_ngn?: number | null
          insurer?: string | null
          location?: string | null
          name: string
          notes?: string | null
          purchase_date: string
          salvage_value_ngn?: number
          status?: string
          updated_at?: string
          useful_life_years?: number
        }
        Update: {
          annual_allowance_rate?: number
          asset_number?: string
          assigned_to?: string | null
          category?: string
          cost_ngn?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          depreciation_method?: string
          description?: string | null
          disposal_date?: string | null
          disposal_notes?: string | null
          disposal_proceeds_ngn?: number | null
          id?: string
          initial_allowance_rate?: number
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          insurance_value_ngn?: number | null
          insurer?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string
          salvage_value_ngn?: number
          status?: string
          updated_at?: string
          useful_life_years?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          overtime_minutes: number
          recorded_by: string | null
          status: string
          updated_at: string
          work_date: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          overtime_minutes?: number
          recorded_by?: string | null
          status?: string
          updated_at?: string
          work_date: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          overtime_minutes?: number
          recorded_by?: string | null
          status?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string | null
          description: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_hash: string | null
          metadata: Json | null
          performed_by: string | null
          performed_by_name: string | null
          prev_hash: string | null
          row_hash: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          performed_by?: string | null
          performed_by_name?: string | null
          prev_hash?: string | null
          row_hash?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          performed_by?: string | null
          performed_by_name?: string | null
          prev_hash?: string | null
          row_hash?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_account_change_requests: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          new_account_name: string
          new_account_number: string
          new_bank_name: string
          reason: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          new_account_name: string
          new_account_number: string
          new_bank_name: string
          reason?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          new_account_name?: string
          new_account_number?: string
          new_bank_name?: string
          reason?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_account_change_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "bank_account_change_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "bank_account_change_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_account_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "bank_account_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "bank_account_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          account_number: string | null
          bank_name: string
          created_at: string
          id: string
          period_end: string | null
          period_start: string | null
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          account_number?: string | null
          bank_name: string
          created_at?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          account_number?: string | null
          bank_name?: string
          created_at?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "bank_statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "bank_statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_items: {
        Row: {
          account_name: string | null
          account_number: string
          account_number_enc: string | null
          amount_ngn: number
          bank_name: string
          batch_id: string
          completed_at: string | null
          contractor_id: string | null
          created_at: string
          employee_id: string | null
          failed_at: string | null
          failure_reason: string | null
          flutterwave_fee_ngn: number
          flutterwave_raw: Json | null
          flutterwave_reference: string | null
          flutterwave_transfer_id: string | null
          full_name: string
          id: string
          is_manually_resolved: boolean
          item_type: string | null
          manual_resolution_at: string | null
          manual_resolution_by: string | null
          manual_resolution_method: string | null
          manual_resolution_note: string | null
          narration: string | null
          paystack_fee_ngn: number
          paystack_raw: Json | null
          paystack_recipient_code: string | null
          paystack_reference: string | null
          paystack_transfer_code: string | null
          processed_at: string | null
          provider: string | null
          receipt_url: string | null
          reference: string | null
          source_usd_minor: number | null
          status: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string
          account_number_enc?: string | null
          amount_ngn?: number
          bank_name?: string
          batch_id: string
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          employee_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          flutterwave_fee_ngn?: number
          flutterwave_raw?: Json | null
          flutterwave_reference?: string | null
          flutterwave_transfer_id?: string | null
          full_name: string
          id?: string
          is_manually_resolved?: boolean
          item_type?: string | null
          manual_resolution_at?: string | null
          manual_resolution_by?: string | null
          manual_resolution_method?: string | null
          manual_resolution_note?: string | null
          narration?: string | null
          paystack_fee_ngn?: number
          paystack_raw?: Json | null
          paystack_recipient_code?: string | null
          paystack_reference?: string | null
          paystack_transfer_code?: string | null
          processed_at?: string | null
          provider?: string | null
          receipt_url?: string | null
          reference?: string | null
          source_usd_minor?: number | null
          status?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string
          account_number_enc?: string | null
          amount_ngn?: number
          bank_name?: string
          batch_id?: string
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          employee_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          flutterwave_fee_ngn?: number
          flutterwave_raw?: Json | null
          flutterwave_reference?: string | null
          flutterwave_transfer_id?: string | null
          full_name?: string
          id?: string
          is_manually_resolved?: boolean
          item_type?: string | null
          manual_resolution_at?: string | null
          manual_resolution_by?: string | null
          manual_resolution_method?: string | null
          manual_resolution_note?: string | null
          narration?: string | null
          paystack_fee_ngn?: number
          paystack_raw?: Json | null
          paystack_recipient_code?: string | null
          paystack_reference?: string | null
          paystack_transfer_code?: string | null
          processed_at?: string | null
          provider?: string | null
          receipt_url?: string | null
          reference?: string | null
          source_usd_minor?: number | null
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
            foreignKeyName: "batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "transactions_view"
            referencedColumns: ["parent_batch_id"]
          },
          {
            foreignKeyName: "batch_items_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "batch_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "batch_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_items_manual_resolution_by_fkey"
            columns: ["manual_resolution_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "batch_items_manual_resolution_by_fkey"
            columns: ["manual_resolution_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "batch_items_manual_resolution_by_fkey"
            columns: ["manual_resolution_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          allocated_ngn: number
          budget_id: string
          category: string
          created_at: string | null
          id: string
          spent_ngn: number
        }
        Insert: {
          allocated_ngn?: number
          budget_id: string
          category: string
          created_at?: string | null
          id?: string
          spent_ngn?: number
        }
        Update: {
          allocated_ngn?: number
          budget_id?: string
          category?: string
          created_at?: string | null
          id?: string
          spent_ngn?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          end_date: string
          id: string
          locked: boolean
          name: string
          notes: string | null
          period: string
          period_end: string | null
          period_start: string | null
          resubmitted_from_id: string | null
          start_date: string
          status: string
          total_amount_ngn: number
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          end_date: string
          id?: string
          locked?: boolean
          name: string
          notes?: string | null
          period: string
          period_end?: string | null
          period_start?: string | null
          resubmitted_from_id?: string | null
          start_date: string
          status?: string
          total_amount_ngn?: number
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          end_date?: string
          id?: string
          locked?: boolean
          name?: string
          notes?: string | null
          period?: string
          period_end?: string | null
          period_start?: string | null
          resubmitted_from_id?: string | null
          start_date?: string
          status?: string
          total_amount_ngn?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "budgets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "budgets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_resubmitted_from_id_fkey"
            columns: ["resubmitted_from_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_balance_snapshots: {
        Row: {
          cash_on_hand_ngn: number
          created_at: string
          external_monthly_burn_ngn: number
          id: string
          in_platform_30d_burn_ngn: number
          monthly_revenue_estimate_ngn: number
          net_monthly_burn_ngn: number
          runway_months_estimate: number | null
          source: string
          taken_by: string | null
          taken_on: string
        }
        Insert: {
          cash_on_hand_ngn?: number
          created_at?: string
          external_monthly_burn_ngn?: number
          id?: string
          in_platform_30d_burn_ngn?: number
          monthly_revenue_estimate_ngn?: number
          net_monthly_burn_ngn?: number
          runway_months_estimate?: number | null
          source?: string
          taken_by?: string | null
          taken_on: string
        }
        Update: {
          cash_on_hand_ngn?: number
          created_at?: string
          external_monthly_burn_ngn?: number
          id?: string
          in_platform_30d_burn_ngn?: number
          monthly_revenue_estimate_ngn?: number
          net_monthly_burn_ngn?: number
          runway_months_estimate?: number | null
          source?: string
          taken_by?: string | null
          taken_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_balance_snapshots_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "cash_balance_snapshots_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "cash_balance_snapshots_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          model: string | null
          role: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          model?: string | null
          role: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          model?: string | null
          role?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chat_rate_limits: {
        Row: {
          count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          count?: number
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      chatbot_config: {
        Row: {
          daily_message_limit: number
          embedding_model: string
          enable_fx_rates: boolean
          enable_platform_query: boolean
          enable_web_search: boolean
          id: string
          is_enabled: boolean
          system_prompt: string
          text_model: string
          updated_at: string
          updated_by: string | null
          vision_model: string
        }
        Insert: {
          daily_message_limit?: number
          embedding_model?: string
          enable_fx_rates?: boolean
          enable_platform_query?: boolean
          enable_web_search?: boolean
          id?: string
          is_enabled?: boolean
          system_prompt?: string
          text_model?: string
          updated_at?: string
          updated_by?: string | null
          vision_model?: string
        }
        Update: {
          daily_message_limit?: number
          embedding_model?: string
          enable_fx_rates?: boolean
          enable_platform_query?: boolean
          enable_web_search?: boolean
          id?: string
          is_enabled?: boolean
          system_prompt?: string
          text_model?: string
          updated_at?: string
          updated_by?: string | null
          vision_model?: string
        }
        Relationships: []
      }
      chatbot_conversations: {
        Row: {
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chatbot_knowledge: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          source: string | null
          tags: string[]
          title: string
          tsv_content: unknown
          updated_at: string
          visible_to_roles: string[]
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          source?: string | null
          tags?: string[]
          title: string
          tsv_content?: unknown
          updated_at?: string
          visible_to_roles?: string[]
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          source?: string | null
          tags?: string[]
          title?: string
          tsv_content?: unknown
          updated_at?: string
          visible_to_roles?: string[]
        }
        Relationships: []
      }
      chatbot_messages: {
        Row: {
          attachments: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          model_used: string | null
          role: string
          tokens_in: number | null
          tokens_out: number | null
          tools_used: string[]
          user_id: string
        }
        Insert: {
          attachments?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model_used?: string | null
          role: string
          tokens_in?: number | null
          tokens_out?: number | null
          tools_used?: string[]
          user_id: string
        }
        Update: {
          attachments?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model_used?: string | null
          role?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tools_used?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_usage: {
        Row: {
          message_count: number
          tokens_total: number
          usage_date: string
          user_id: string
        }
        Insert: {
          message_count?: number
          tokens_total?: number
          usage_date?: string
          user_id: string
        }
        Update: {
          message_count?: number
          tokens_total?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          contact_person: string | null
          contract_value_ngn: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          phone: string | null
          start_date: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          contract_value_ngn?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          contract_value_ngn?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      commission_overrides: {
        Row: {
          contractor_id: string
          is_affiliate: boolean
          manual_count: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contractor_id: string
          is_affiliate?: boolean
          manual_count?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contractor_id?: string
          is_affiliate?: boolean
          manual_count?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_overrides_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "commission_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "commission_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          active_payment_provider: string
          address: string | null
          affiliate_rate_tier2_usd_minor: number
          affiliate_rate_usd_minor: number
          affiliate_tier_mode: string
          affiliate_tier_threshold: number
          airtable_api_key_configured: boolean
          airtable_api_key_enc: string | null
          airtable_base_id: string | null
          airtable_expenses_table_id: string | null
          airtable_income_table_id: string | null
          airtable_sync_enabled: boolean | null
          allow_self_signup: boolean
          audit_log_retention_days: number
          awol_auto_flag_enabled: boolean
          cash_on_hand_ngn: number | null
          cash_updated_at: string | null
          company_name: string
          created_at: string
          currency_code: string
          dual_approval_threshold_ngn: number
          employer_rc_number: string | null
          employer_tin: string | null
          expense_limits: Json
          external_monthly_burn_ngn: number | null
          facebook_url: string | null
          fiscal_year_preset: string | null
          fiscal_year_start_month: number
          flutterwave_funding_account_name: string | null
          flutterwave_funding_account_number: string | null
          flutterwave_funding_bank: string | null
          flutterwave_mode: string
          fuel_weekly_budgets: Json
          fx_deviation_threshold_pct: number
          gratuity_months_per_year: number
          id: string
          instagram_url: string | null
          itf_employer_code: string | null
          itf_enabled: boolean
          last_month_prorated: boolean
          leave_carryover_enabled: boolean
          leave_carryover_max_days: number
          linkedin_url: string | null
          logo_url: string | null
          maternity_leave_days: number
          max_single_transfer_ngn: number | null
          mfa_required_for_all_users: boolean
          monthly_revenue_estimate_ngn: number | null
          nhf_employer_code: string | null
          nsitf_employer_code: string | null
          nsitf_enabled: boolean
          partner_pay_usd_minor: number
          paternity_leave_days: number
          payment_email_audience: string
          paystack_funding_account_name: string | null
          paystack_funding_account_number: string | null
          paystack_funding_bank: string | null
          paystack_mode: string | null
          paystack_public_key: string | null
          paystack_secret_configured: boolean
          paystack_secret_key_enc: string | null
          paystack_webhook_url: string | null
          pencom_employer_code: string | null
          probation_period_days: number
          probation_review_enabled: boolean
          provider_switched_at: string | null
          provider_switched_by: string | null
          quick_pay_enabled: boolean
          rc_number: string | null
          referral_qualifying_days: number
          referral_rate_usd_minor: number
          resend_api_key_configured: boolean | null
          resend_api_key_enc: string | null
          resend_from_address: string | null
          salary_components_default: boolean
          session_timeout_minutes: number | null
          sms_enabled: boolean | null
          smtp_from_address: string | null
          smtp_host: string | null
          smtp_password_enc: string | null
          smtp_port: number | null
          smtp_username: string | null
          state_of_business: string | null
          tenant_id: string | null
          termii_api_key_configured: boolean | null
          termii_api_key_enc: string | null
          termii_sender_id: string | null
          timezone: string
          tin: string | null
          twitter_url: string | null
          updated_at: string
          usd_rate: number | null
          vapid_private_key: string | null
          vapid_public_key: string | null
          vapid_subject: string | null
          website: string | null
          website_url: string | null
          whatsapp_enabled: boolean | null
        }
        Insert: {
          active_payment_provider?: string
          address?: string | null
          affiliate_rate_tier2_usd_minor?: number
          affiliate_rate_usd_minor?: number
          affiliate_tier_mode?: string
          affiliate_tier_threshold?: number
          airtable_api_key_configured?: boolean
          airtable_api_key_enc?: string | null
          airtable_base_id?: string | null
          airtable_expenses_table_id?: string | null
          airtable_income_table_id?: string | null
          airtable_sync_enabled?: boolean | null
          allow_self_signup?: boolean
          audit_log_retention_days?: number
          awol_auto_flag_enabled?: boolean
          cash_on_hand_ngn?: number | null
          cash_updated_at?: string | null
          company_name?: string
          created_at?: string
          currency_code?: string
          dual_approval_threshold_ngn?: number
          employer_rc_number?: string | null
          employer_tin?: string | null
          expense_limits?: Json
          external_monthly_burn_ngn?: number | null
          facebook_url?: string | null
          fiscal_year_preset?: string | null
          fiscal_year_start_month?: number
          flutterwave_funding_account_name?: string | null
          flutterwave_funding_account_number?: string | null
          flutterwave_funding_bank?: string | null
          flutterwave_mode?: string
          fuel_weekly_budgets?: Json
          fx_deviation_threshold_pct?: number
          gratuity_months_per_year?: number
          id?: string
          instagram_url?: string | null
          itf_employer_code?: string | null
          itf_enabled?: boolean
          last_month_prorated?: boolean
          leave_carryover_enabled?: boolean
          leave_carryover_max_days?: number
          linkedin_url?: string | null
          logo_url?: string | null
          maternity_leave_days?: number
          max_single_transfer_ngn?: number | null
          mfa_required_for_all_users?: boolean
          monthly_revenue_estimate_ngn?: number | null
          nhf_employer_code?: string | null
          nsitf_employer_code?: string | null
          nsitf_enabled?: boolean
          partner_pay_usd_minor?: number
          paternity_leave_days?: number
          payment_email_audience?: string
          paystack_funding_account_name?: string | null
          paystack_funding_account_number?: string | null
          paystack_funding_bank?: string | null
          paystack_mode?: string | null
          paystack_public_key?: string | null
          paystack_secret_configured?: boolean
          paystack_secret_key_enc?: string | null
          paystack_webhook_url?: string | null
          pencom_employer_code?: string | null
          probation_period_days?: number
          probation_review_enabled?: boolean
          provider_switched_at?: string | null
          provider_switched_by?: string | null
          quick_pay_enabled?: boolean
          rc_number?: string | null
          referral_qualifying_days?: number
          referral_rate_usd_minor?: number
          resend_api_key_configured?: boolean | null
          resend_api_key_enc?: string | null
          resend_from_address?: string | null
          salary_components_default?: boolean
          session_timeout_minutes?: number | null
          sms_enabled?: boolean | null
          smtp_from_address?: string | null
          smtp_host?: string | null
          smtp_password_enc?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          state_of_business?: string | null
          tenant_id?: string | null
          termii_api_key_configured?: boolean | null
          termii_api_key_enc?: string | null
          termii_sender_id?: string | null
          timezone?: string
          tin?: string | null
          twitter_url?: string | null
          updated_at?: string
          usd_rate?: number | null
          vapid_private_key?: string | null
          vapid_public_key?: string | null
          vapid_subject?: string | null
          website?: string | null
          website_url?: string | null
          whatsapp_enabled?: boolean | null
        }
        Update: {
          active_payment_provider?: string
          address?: string | null
          affiliate_rate_tier2_usd_minor?: number
          affiliate_rate_usd_minor?: number
          affiliate_tier_mode?: string
          affiliate_tier_threshold?: number
          airtable_api_key_configured?: boolean
          airtable_api_key_enc?: string | null
          airtable_base_id?: string | null
          airtable_expenses_table_id?: string | null
          airtable_income_table_id?: string | null
          airtable_sync_enabled?: boolean | null
          allow_self_signup?: boolean
          audit_log_retention_days?: number
          awol_auto_flag_enabled?: boolean
          cash_on_hand_ngn?: number | null
          cash_updated_at?: string | null
          company_name?: string
          created_at?: string
          currency_code?: string
          dual_approval_threshold_ngn?: number
          employer_rc_number?: string | null
          employer_tin?: string | null
          expense_limits?: Json
          external_monthly_burn_ngn?: number | null
          facebook_url?: string | null
          fiscal_year_preset?: string | null
          fiscal_year_start_month?: number
          flutterwave_funding_account_name?: string | null
          flutterwave_funding_account_number?: string | null
          flutterwave_funding_bank?: string | null
          flutterwave_mode?: string
          fuel_weekly_budgets?: Json
          fx_deviation_threshold_pct?: number
          gratuity_months_per_year?: number
          id?: string
          instagram_url?: string | null
          itf_employer_code?: string | null
          itf_enabled?: boolean
          last_month_prorated?: boolean
          leave_carryover_enabled?: boolean
          leave_carryover_max_days?: number
          linkedin_url?: string | null
          logo_url?: string | null
          maternity_leave_days?: number
          max_single_transfer_ngn?: number | null
          mfa_required_for_all_users?: boolean
          monthly_revenue_estimate_ngn?: number | null
          nhf_employer_code?: string | null
          nsitf_employer_code?: string | null
          nsitf_enabled?: boolean
          partner_pay_usd_minor?: number
          paternity_leave_days?: number
          payment_email_audience?: string
          paystack_funding_account_name?: string | null
          paystack_funding_account_number?: string | null
          paystack_funding_bank?: string | null
          paystack_mode?: string | null
          paystack_public_key?: string | null
          paystack_secret_configured?: boolean
          paystack_secret_key_enc?: string | null
          paystack_webhook_url?: string | null
          pencom_employer_code?: string | null
          probation_period_days?: number
          probation_review_enabled?: boolean
          provider_switched_at?: string | null
          provider_switched_by?: string | null
          quick_pay_enabled?: boolean
          rc_number?: string | null
          referral_qualifying_days?: number
          referral_rate_usd_minor?: number
          resend_api_key_configured?: boolean | null
          resend_api_key_enc?: string | null
          resend_from_address?: string | null
          salary_components_default?: boolean
          session_timeout_minutes?: number | null
          sms_enabled?: boolean | null
          smtp_from_address?: string | null
          smtp_host?: string | null
          smtp_password_enc?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          state_of_business?: string | null
          tenant_id?: string | null
          termii_api_key_configured?: boolean | null
          termii_api_key_enc?: string | null
          termii_sender_id?: string | null
          timezone?: string
          tin?: string | null
          twitter_url?: string | null
          updated_at?: string
          usd_rate?: number | null
          vapid_private_key?: string | null
          vapid_public_key?: string | null
          vapid_subject?: string | null
          website?: string | null
          website_url?: string | null
          whatsapp_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_provider_switched_by_fkey"
            columns: ["provider_switched_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "company_settings_provider_switched_by_fkey"
            columns: ["provider_switched_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "company_settings_provider_switched_by_fkey"
            columns: ["provider_switched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_filings: {
        Row: {
          amount_ngn: number | null
          auto_calculated_at: string | null
          breakdown_json: Json | null
          created_at: string
          due_date: string
          filed_at: string | null
          filed_by: string | null
          id: string
          kind: string
          notes: string | null
          payroll_run_id: string | null
          period: string
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_ngn?: number | null
          auto_calculated_at?: string | null
          breakdown_json?: Json | null
          created_at?: string
          due_date: string
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          kind: string
          notes?: string | null
          payroll_run_id?: string | null
          period: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_ngn?: number | null
          auto_calculated_at?: string | null
          breakdown_json?: Json | null
          created_at?: string
          due_date?: string
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          kind?: string
          notes?: string | null
          payroll_run_id?: string | null
          period?: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_filings_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "compliance_filings_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "compliance_filings_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_filings_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_log: {
        Row: {
          created_at: string
          email: string | null
          id: string
          ip_hash: string | null
          policy: string
          policy_version: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          ip_hash?: string | null
          policy: string
          policy_version: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          ip_hash?: string | null
          policy?: string
          policy_version?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_activities: {
        Row: {
          action: string
          contact_id: string
          created_at: string
          detail: string | null
          id: string
          performed_by: string | null
          performed_by_name: string | null
        }
        Insert: {
          action: string
          contact_id: string
          created_at?: string
          detail?: string | null
          id?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Update: {
          action?: string
          contact_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contact_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contact_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_whatsapp_groups: {
        Row: {
          contact_id: string
          group_id: string
          id: string
          joined_at: string
        }
        Insert: {
          contact_id: string
          group_id: string
          id?: string
          joined_at?: string
        }
        Update: {
          contact_id?: string
          group_id?: string
          id?: string
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_whatsapp_groups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_whatsapp_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          contact_type: string
          converted_to_contractor_id: string | null
          converted_to_employee_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          contact_type?: string
          converted_to_contractor_id?: string | null
          converted_to_employee_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          full_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          contact_type?: string
          converted_to_contractor_id?: string | null
          converted_to_employee_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_converted_to_contractor_id_fkey"
            columns: ["converted_to_contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_converted_to_employee_id_fkey"
            columns: ["converted_to_employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contacts_converted_to_employee_id_fkey"
            columns: ["converted_to_employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contacts_converted_to_employee_id_fkey"
            columns: ["converted_to_employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_applications: {
        Row: {
          account_name: string | null
          account_number: string
          account_number_enc: string | null
          additional_info: string | null
          approved_by: string | null
          bank_name: string
          contractor_id: string | null
          created_at: string
          default_amount_ngn: number | null
          email: string
          first_name: string | null
          full_name: string
          heyreach_password: string | null
          heyreach_password_enc: string | null
          id: string
          last_name: string | null
          linkedin_email: string | null
          linkedin_full_name: string | null
          linkedin_profile_url: string | null
          linkedin_url: string | null
          phone: string | null
          referral_code: string | null
          rejection_reason: string | null
          status: string
        }
        Insert: {
          account_name?: string | null
          account_number: string
          account_number_enc?: string | null
          additional_info?: string | null
          approved_by?: string | null
          bank_name: string
          contractor_id?: string | null
          created_at?: string
          default_amount_ngn?: number | null
          email: string
          first_name?: string | null
          full_name: string
          heyreach_password?: string | null
          heyreach_password_enc?: string | null
          id?: string
          last_name?: string | null
          linkedin_email?: string | null
          linkedin_full_name?: string | null
          linkedin_profile_url?: string | null
          linkedin_url?: string | null
          phone?: string | null
          referral_code?: string | null
          rejection_reason?: string | null
          status?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string
          account_number_enc?: string | null
          additional_info?: string | null
          approved_by?: string | null
          bank_name?: string
          contractor_id?: string | null
          created_at?: string
          default_amount_ngn?: number | null
          email?: string
          first_name?: string | null
          full_name?: string
          heyreach_password?: string | null
          heyreach_password_enc?: string | null
          id?: string
          last_name?: string | null
          linkedin_email?: string | null
          linkedin_full_name?: string | null
          linkedin_profile_url?: string | null
          linkedin_url?: string | null
          phone?: string | null
          referral_code?: string | null
          rejection_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_applications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contractor_applications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contractor_applications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_applications_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          account_name: string | null
          account_number: string
          account_number_enc: string | null
          agreement_signed: boolean | null
          bank_code: string | null
          bank_name: string
          bvn_last4: string | null
          bvn_verified: boolean | null
          created_at: string
          default_amount: number | null
          default_amount_ngn: number
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          heyreach_account_id: number | null
          heyreach_active_campaigns: number | null
          heyreach_auth_valid: boolean | null
          heyreach_email: string | null
          heyreach_password_enc: string | null
          heyreach_status: string | null
          heyreach_synced_at: string | null
          id: string
          is_anonymised: boolean | null
          kyc_document_uploaded: boolean | null
          last_name: string | null
          linkedin_id: string | null
          linkedin_url: string | null
          nin_last4: string | null
          notes: string | null
          onboarded_at: string | null
          onboarding_complete: boolean | null
          pay_amount_usd_minor: number | null
          payslip_url: string | null
          paystack_recipient_code: string | null
          phone: string | null
          recipient_code_created_at: string | null
          status: string
          tags: string[] | null
          whatsapp_phone: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string
          account_number_enc?: string | null
          agreement_signed?: boolean | null
          bank_code?: string | null
          bank_name?: string
          bvn_last4?: string | null
          bvn_verified?: boolean | null
          created_at?: string
          default_amount?: number | null
          default_amount_ngn?: number
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name: string
          heyreach_account_id?: number | null
          heyreach_active_campaigns?: number | null
          heyreach_auth_valid?: boolean | null
          heyreach_email?: string | null
          heyreach_password_enc?: string | null
          heyreach_status?: string | null
          heyreach_synced_at?: string | null
          id?: string
          is_anonymised?: boolean | null
          kyc_document_uploaded?: boolean | null
          last_name?: string | null
          linkedin_id?: string | null
          linkedin_url?: string | null
          nin_last4?: string | null
          notes?: string | null
          onboarded_at?: string | null
          onboarding_complete?: boolean | null
          pay_amount_usd_minor?: number | null
          payslip_url?: string | null
          paystack_recipient_code?: string | null
          phone?: string | null
          recipient_code_created_at?: string | null
          status?: string
          tags?: string[] | null
          whatsapp_phone?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string
          account_number_enc?: string | null
          agreement_signed?: boolean | null
          bank_code?: string | null
          bank_name?: string
          bvn_last4?: string | null
          bvn_verified?: boolean | null
          created_at?: string
          default_amount?: number | null
          default_amount_ngn?: number
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          heyreach_account_id?: number | null
          heyreach_active_campaigns?: number | null
          heyreach_auth_valid?: boolean | null
          heyreach_email?: string | null
          heyreach_password_enc?: string | null
          heyreach_status?: string | null
          heyreach_synced_at?: string | null
          id?: string
          is_anonymised?: boolean | null
          kyc_document_uploaded?: boolean | null
          last_name?: string | null
          linkedin_id?: string | null
          linkedin_url?: string | null
          nin_last4?: string | null
          notes?: string | null
          onboarded_at?: string | null
          onboarding_complete?: boolean | null
          pay_amount_usd_minor?: number | null
          payslip_url?: string | null
          paystack_recipient_code?: string | null
          phone?: string | null
          recipient_code_created_at?: string | null
          status?: string
          tags?: string[] | null
          whatsapp_phone?: string | null
        }
        Relationships: []
      }
      data_subject_requests: {
        Row: {
          artifact_path: string | null
          completed_at: string | null
          created_at: string
          id: string
          reason: string | null
          request_type: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: string
          user_id: string
        }
        Insert: {
          artifact_path?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          request_type: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          user_id: string
        }
        Update: {
          artifact_path?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          request_type?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "data_subject_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "data_subject_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          budget_ngn: number | null
          created_at: string | null
          description: string | null
          head_id: string | null
          id: string
          name: string
        }
        Insert: {
          budget_ngn?: number | null
          created_at?: string | null
          description?: string | null
          head_id?: string | null
          id?: string
          name: string
        }
        Update: {
          budget_ngn?: number | null
          created_at?: string | null
          description?: string | null
          head_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "departments_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "departments_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_records: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          expunge_reason: string | null
          expunged_at: string | null
          expunged_by: string | null
          id: string
          incident_date: string
          incident_type: string
          is_expunged: boolean
          issued_by: string | null
          outcome: string | null
          subject: string
          suspension_days: number | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          expunge_reason?: string | null
          expunged_at?: string | null
          expunged_by?: string | null
          id?: string
          incident_date: string
          incident_type: string
          is_expunged?: boolean
          issued_by?: string | null
          outcome?: string | null
          subject: string
          suspension_days?: number | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          expunge_reason?: string | null
          expunged_at?: string | null
          expunged_by?: string | null
          id?: string
          incident_date?: string
          incident_type?: string
          is_expunged?: boolean
          issued_by?: string | null
          outcome?: string | null
          subject?: string
          suspension_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      disciplinary_responses: {
        Row: {
          id: string
          record_id: string
          responded_at: string
          responded_by: string | null
          response_text: string
        }
        Insert: {
          id?: string
          record_id: string
          responded_at?: string
          responded_by?: string | null
          response_text: string
        }
        Update: {
          id?: string
          record_id?: string
          responded_at?: string
          responded_by?: string | null
          response_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_responses_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "disciplinary_records"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          certificate_type: string | null
          created_at: string | null
          deleted_at: string | null
          department_id: string | null
          description: string | null
          employee_id: string | null
          expires_at: string | null
          expiry_date: string | null
          file_size_bytes: number | null
          file_type: string | null
          file_url: string
          id: string
          mime_type: string | null
          name: string | null
          storage_path: string | null
          tags: string[] | null
          title: string | null
          updated_at: string
          uploaded_by: string | null
          visible_to_roles: string[]
        }
        Insert: {
          category?: string
          certificate_type?: string | null
          created_at?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          employee_id?: string | null
          expires_at?: string | null
          expiry_date?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          mime_type?: string | null
          name?: string | null
          storage_path?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          visible_to_roles?: string[]
        }
        Update: {
          category?: string
          certificate_type?: string | null
          created_at?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          employee_id?: string | null
          expires_at?: string | null
          expiry_date?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          mime_type?: string | null
          name?: string | null
          storage_path?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          visible_to_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          error: string | null
          id: string
          name: string | null
          resend_id: string | null
          sent_at: string | null
          status: string
          vars: Json
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          error?: string | null
          id?: string
          name?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          vars?: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          name?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          vars?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          html_body: string
          id: string
          name: string | null
          started_at: string | null
          status: string
          subject: string
          template_key: string | null
          template_vars: Json
          test_mode: boolean
          text_body: string | null
          total_failed: number
          total_recipients: number
          total_sent: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          html_body: string
          id?: string
          name?: string | null
          started_at?: string | null
          status?: string
          subject: string
          template_key?: string | null
          template_vars?: Json
          test_mode?: boolean
          text_body?: string | null
          total_failed?: number
          total_recipients?: number
          total_sent?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          html_body?: string
          id?: string
          name?: string | null
          started_at?: string | null
          status?: string
          subject?: string
          template_key?: string | null
          template_vars?: Json
          test_mode?: boolean
          text_body?: string | null
          total_failed?: number
          total_recipients?: number
          total_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: string
          created_at: string
          default_html_body: string
          default_subject: string
          default_text_body: string | null
          description: string | null
          html_body: string
          id: string
          is_system: boolean
          key: string
          name: string
          subject: string
          text_body: string | null
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          category?: string
          created_at?: string
          default_html_body: string
          default_subject: string
          default_text_body?: string | null
          description?: string | null
          html_body: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          subject: string
          text_body?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          category?: string
          created_at?: string
          default_html_body?: string
          default_subject?: string
          default_text_body?: string | null
          description?: string | null
          html_body?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          subject?: string
          text_body?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_advances: {
        Row: {
          amount_ngn: number
          created_at: string
          deduction_per_month: number | null
          employee_id: string
          id: string
          notes: string | null
          outstanding_ngn: number
          repayment_months: number
          source_batch_id: string | null
          source_batch_item_id: string | null
          start_period: string | null
          status: string
        }
        Insert: {
          amount_ngn?: number
          created_at?: string
          deduction_per_month?: number | null
          employee_id: string
          id?: string
          notes?: string | null
          outstanding_ngn?: number
          repayment_months?: number
          source_batch_id?: string | null
          source_batch_item_id?: string | null
          start_period?: string | null
          status?: string
        }
        Update: {
          amount_ngn?: number
          created_at?: string
          deduction_per_month?: number | null
          employee_id?: string
          id?: string
          notes?: string | null
          outstanding_ngn?: number
          repayment_months?: number
          source_batch_id?: string | null
          source_batch_item_id?: string | null
          start_period?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advances_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advances_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "transactions_view"
            referencedColumns: ["parent_batch_id"]
          },
          {
            foreignKeyName: "employee_advances_source_batch_item_id_fkey"
            columns: ["source_batch_item_id"]
            isOneToOne: false
            referencedRelation: "batch_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advances_source_batch_item_id_fkey"
            columns: ["source_batch_item_id"]
            isOneToOne: false
            referencedRelation: "transactions_view"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_benefits: {
        Row: {
          benefit_type: string
          created_at: string
          created_by: string | null
          employee_id: string
          enrollment_date: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          pfa_rsa_pin: string | null
          plan_name: string | null
          policy_number: string | null
          premium_frequency: string
          premium_ngn: number | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          benefit_type: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          enrollment_date?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          pfa_rsa_pin?: string | null
          plan_name?: string | null
          policy_number?: string | null
          premium_frequency?: string
          premium_ngn?: number | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          benefit_type?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          enrollment_date?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          pfa_rsa_pin?: string | null
          plan_name?: string | null
          policy_number?: string | null
          premium_frequency?: string
          premium_ngn?: number | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_deductions: {
        Row: {
          amount_deducted_to_date: number
          amount_ngn: number
          created_at: string
          created_by: string | null
          description: string
          end_date: string | null
          entity_id: string
          entity_type: string
          frequency: string
          id: string
          start_date: string
          status: string
          total_deductible_amount: number | null
        }
        Insert: {
          amount_deducted_to_date?: number
          amount_ngn: number
          created_at?: string
          created_by?: string | null
          description: string
          end_date?: string | null
          entity_id: string
          entity_type: string
          frequency?: string
          id?: string
          start_date: string
          status?: string
          total_deductible_amount?: number | null
        }
        Update: {
          amount_deducted_to_date?: number
          amount_ngn?: number
          created_at?: string
          created_by?: string | null
          description?: string
          end_date?: string | null
          entity_id?: string
          entity_type?: string
          frequency?: string
          id?: string
          start_date?: string
          status?: string
          total_deductible_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_deductions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_deductions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_deductions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loans: {
        Row: {
          amount_ngn: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deduct_from_payroll: boolean
          disbursement_date: string
          employee_id: string
          first_repayment_date: string
          id: string
          interest_rate_pct: number
          monthly_installment_ngn: number
          notes: string | null
          purpose: string
          status: string
          tenure_months: number
          updated_at: string
        }
        Insert: {
          amount_ngn: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deduct_from_payroll?: boolean
          disbursement_date?: string
          employee_id: string
          first_repayment_date: string
          id?: string
          interest_rate_pct?: number
          monthly_installment_ngn: number
          notes?: string | null
          purpose: string
          status?: string
          tenure_months: number
          updated_at?: string
        }
        Update: {
          amount_ngn?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deduct_from_payroll?: boolean
          disbursement_date?: string
          employee_id?: string
          first_repayment_date?: string
          id?: string
          interest_rate_pct?: number
          monthly_installment_ngn?: number
          notes?: string | null
          purpose?: string
          status?: string
          tenure_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      ewa_requests: {
        Row: {
          accrued_at_request_ngn: number
          amount_ngn: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          disbursed_at: string | null
          disbursed_batch_item_id: string | null
          employee_id: string
          id: string
          notes: string | null
          reason: string | null
          rejection_reason: string | null
          salary_at_request_ngn: number
          settled_at: string | null
          settled_payroll_run_id: string | null
          settlement_period: string
          status: string
          updated_at: string
        }
        Insert: {
          accrued_at_request_ngn?: number
          amount_ngn: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          disbursed_at?: string | null
          disbursed_batch_item_id?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          reason?: string | null
          rejection_reason?: string | null
          salary_at_request_ngn?: number
          settled_at?: string | null
          settled_payroll_run_id?: string | null
          settlement_period?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accrued_at_request_ngn?: number
          amount_ngn?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          disbursed_at?: string | null
          disbursed_batch_item_id?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          reason?: string | null
          rejection_reason?: string | null
          salary_at_request_ngn?: number
          settled_at?: string | null
          settled_payroll_run_id?: string | null
          settlement_period?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewa_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "ewa_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "ewa_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewa_requests_disbursed_batch_item_id_fkey"
            columns: ["disbursed_batch_item_id"]
            isOneToOne: false
            referencedRelation: "batch_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewa_requests_disbursed_batch_item_id_fkey"
            columns: ["disbursed_batch_item_id"]
            isOneToOne: false
            referencedRelation: "transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewa_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "ewa_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "ewa_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewa_requests_settled_payroll_run_id_fkey"
            columns: ["settled_payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_name: string | null
          account_number: string | null
          admin_note: string | null
          amount_ngn: number
          approved_at: string | null
          approved_by: string | null
          bank_name: string | null
          budget_category: string | null
          category: string
          co_approval_required: boolean
          created_at: string
          date: string
          deleted_at: string | null
          description: string | null
          fuel_request_id: string | null
          id: string
          is_reimbursement: boolean
          mileage_km: number | null
          payload_hash_at_approval: string | null
          payment_reference: string | null
          payment_status: string | null
          processed_at: string | null
          processed_by: string | null
          rate_per_km_ngn: number | null
          receipt_url: string | null
          rejection_reason: string | null
          resubmitted_from_id: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          submitted_by: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          admin_note?: string | null
          amount_ngn?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_name?: string | null
          budget_category?: string | null
          category: string
          co_approval_required?: boolean
          created_at?: string
          date: string
          deleted_at?: string | null
          description?: string | null
          fuel_request_id?: string | null
          id?: string
          is_reimbursement?: boolean
          mileage_km?: number | null
          payload_hash_at_approval?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rate_per_km_ngn?: number | null
          receipt_url?: string | null
          rejection_reason?: string | null
          resubmitted_from_id?: string | null
          second_approved_at?: string | null
          second_approver_id?: string | null
          status?: string
          submitted_by: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          admin_note?: string | null
          amount_ngn?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_name?: string | null
          budget_category?: string | null
          category?: string
          co_approval_required?: boolean
          created_at?: string
          date?: string
          deleted_at?: string | null
          description?: string | null
          fuel_request_id?: string | null
          id?: string
          is_reimbursement?: boolean
          mileage_km?: number | null
          payload_hash_at_approval?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rate_per_km_ngn?: number | null
          receipt_url?: string | null
          rejection_reason?: string | null
          resubmitted_from_id?: string | null
          second_approved_at?: string | null
          second_approver_id?: string | null
          status?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_fuel_request_id_fkey"
            columns: ["fuel_request_id"]
            isOneToOne: false
            referencedRelation: "fuel_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "expenses_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "expenses_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_resubmitted_from_id_fkey"
            columns: ["resubmitted_from_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_second_approver_id_fkey"
            columns: ["second_approver_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "expenses_second_approver_id_fkey"
            columns: ["second_approver_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "expenses_second_approver_id_fkey"
            columns: ["second_approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "expenses_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "expenses_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_hash: string | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      fuel_level_logs: {
        Row: {
          amount_litres: number
          created_at: string
          event_type: string
          id: string
          reference_id: string | null
          resulting_level_litres: number
          vehicle_id: string
        }
        Insert: {
          amount_litres: number
          created_at?: string
          event_type: string
          id?: string
          reference_id?: string | null
          resulting_level_litres: number
          vehicle_id: string
        }
        Update: {
          amount_litres?: number
          created_at?: string
          event_type?: string
          id?: string
          reference_id?: string | null
          resulting_level_litres?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_level_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_requests: {
        Row: {
          account_name: string | null
          account_number: string | null
          admin_note: string | null
          amount_ngn: number
          anomaly_review_note: string | null
          anomaly_reviewed_at: string | null
          anomaly_reviewed_by: string | null
          anomaly_type: string | null
          bank_name: string | null
          batch_id: string | null
          budget_exception: boolean
          budget_exception_at: string | null
          budget_exception_by: string | null
          created_at: string
          deleted_at: string | null
          driver_id: string
          fuel_station_name: string | null
          id: string
          is_anomaly: boolean
          litres_est: number | null
          litres_filled: number | null
          odometer: number | null
          payment_sent_at: string | null
          reason: string | null
          receipt_url: string | null
          rejection_reason: string | null
          request_doc_url: string | null
          resubmitted_from_id: string | null
          station_name: string
          status: string
          vehicle_id: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          admin_note?: string | null
          amount_ngn?: number
          anomaly_review_note?: string | null
          anomaly_reviewed_at?: string | null
          anomaly_reviewed_by?: string | null
          anomaly_type?: string | null
          bank_name?: string | null
          batch_id?: string | null
          budget_exception?: boolean
          budget_exception_at?: string | null
          budget_exception_by?: string | null
          created_at?: string
          deleted_at?: string | null
          driver_id: string
          fuel_station_name?: string | null
          id?: string
          is_anomaly?: boolean
          litres_est?: number | null
          litres_filled?: number | null
          odometer?: number | null
          payment_sent_at?: string | null
          reason?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          request_doc_url?: string | null
          resubmitted_from_id?: string | null
          station_name?: string
          status?: string
          vehicle_id?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          admin_note?: string | null
          amount_ngn?: number
          anomaly_review_note?: string | null
          anomaly_reviewed_at?: string | null
          anomaly_reviewed_by?: string | null
          anomaly_type?: string | null
          bank_name?: string | null
          batch_id?: string | null
          budget_exception?: boolean
          budget_exception_at?: string | null
          budget_exception_by?: string | null
          created_at?: string
          deleted_at?: string | null
          driver_id?: string
          fuel_station_name?: string | null
          id?: string
          is_anomaly?: boolean
          litres_est?: number | null
          litres_filled?: number | null
          odometer?: number | null
          payment_sent_at?: string | null
          reason?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          request_doc_url?: string | null
          resubmitted_from_id?: string | null
          station_name?: string
          status?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_requests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_requests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "transactions_view"
            referencedColumns: ["parent_batch_id"]
          },
          {
            foreignKeyName: "fuel_requests_budget_exception_by_fkey"
            columns: ["budget_exception_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fuel_requests_budget_exception_by_fkey"
            columns: ["budget_exception_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fuel_requests_budget_exception_by_fkey"
            columns: ["budget_exception_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fuel_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fuel_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_requests_resubmitted_from_id_fkey"
            columns: ["resubmitted_from_id"]
            isOneToOne: false
            referencedRelation: "fuel_requests"
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
      fx_rates: {
        Row: {
          base: string
          created_at: string
          created_by: string | null
          deviation_pct: number | null
          fetched_at: string
          id: string
          note: string | null
          prev_rate: number | null
          quote: string
          rate: number
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          valid_from: string
        }
        Insert: {
          base: string
          created_at?: string
          created_by?: string | null
          deviation_pct?: number | null
          fetched_at?: string
          id?: string
          note?: string | null
          prev_rate?: number | null
          quote: string
          rate: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: string
          valid_from?: string
        }
        Update: {
          base?: string
          created_at?: string
          created_by?: string | null
          deviation_pct?: number | null
          fetched_at?: string
          id?: string
          note?: string | null
          prev_rate?: number | null
          quote?: string
          rate?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fx_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fx_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_rates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fx_rates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fx_rates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          active: boolean
          center_lat: number
          center_lng: number
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          radius_meters: number
        }
        Insert: {
          active?: boolean
          center_lat: number
          center_lng: number
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          radius_meters?: number
        }
        Update: {
          active?: boolean
          center_lat?: number
          center_lng?: number
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          radius_meters?: number
        }
        Relationships: []
      }
      global_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          module: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          module?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          module?: string
          name?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          id: string
          owner_id: string | null
          progress_pct: number
          quarter: string
          scope: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          owner_id?: string | null
          progress_pct?: number
          quarter: string
          scope?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          owner_id?: string | null
          progress_pct?: number
          quarter?: string
          scope?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      heyreach_sync_log: {
        Row: {
          accounts_fetched: number
          changes: Json
          contractors_checked: number
          error: string | null
          finished_at: string | null
          id: string
          matched: number
          ok: boolean
          started_at: string
          triggered_by: string
          unmatched: number
          updated: number
        }
        Insert: {
          accounts_fetched?: number
          changes?: Json
          contractors_checked?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          matched?: number
          ok?: boolean
          started_at?: string
          triggered_by?: string
          unmatched?: number
          updated?: number
        }
        Update: {
          accounts_fetched?: number
          changes?: Json
          contractors_checked?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          matched?: number
          ok?: boolean
          started_at?: string
          triggered_by?: string
          unmatched?: number
          updated?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_email: string | null
          client_id: string | null
          client_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json
          notes: string | null
          paid_date: string | null
          payment_terms: string
          status: string
          subtotal_ngn: number
          total_ngn: number
          updated_at: string
          vat_amount_ngn: number
          vat_rate: number
        }
        Insert: {
          client_email?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date: string
          id?: string
          invoice_number: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          paid_date?: string | null
          payment_terms?: string
          status?: string
          subtotal_ngn?: number
          total_ngn?: number
          updated_at?: string
          vat_amount_ngn?: number
          vat_rate?: number
        }
        Update: {
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          paid_date?: string | null
          payment_terms?: string
          status?: string
          subtotal_ngn?: number
          total_ngn?: number
          updated_at?: string
          vat_amount_ngn?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applicants: {
        Row: {
          assigned_to: string | null
          cover_letter: string | null
          created_at: string
          created_by: string | null
          cv_url: string | null
          email: string | null
          full_name: string
          id: string
          interview_date: string | null
          offer_amount_ngn: number | null
          offered_at: string | null
          opening_id: string
          phone: string | null
          rejection_reason: string | null
          source: string
          stage: string
          stage_notes: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          cover_letter?: string | null
          created_at?: string
          created_by?: string | null
          cv_url?: string | null
          email?: string | null
          full_name: string
          id?: string
          interview_date?: string | null
          offer_amount_ngn?: number | null
          offered_at?: string | null
          opening_id: string
          phone?: string | null
          rejection_reason?: string | null
          source?: string
          stage?: string
          stage_notes?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          cover_letter?: string | null
          created_at?: string
          created_by?: string | null
          cv_url?: string | null
          email?: string | null
          full_name?: string
          id?: string
          interview_date?: string | null
          offer_amount_ngn?: number | null
          offered_at?: string | null
          opening_id?: string
          phone?: string | null
          rejection_reason?: string | null
          source?: string
          stage?: string
          stage_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applicants_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_openings: {
        Row: {
          closing_date: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          description: string | null
          employment_type: string
          id: string
          location: string | null
          notes: string | null
          opening_count: number
          requirements: string | null
          salary_max_ngn: number | null
          salary_min_ngn: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          closing_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          employment_type?: string
          id?: string
          location?: string | null
          notes?: string | null
          opening_count?: number
          requirements?: string | null
          salary_max_ngn?: number | null
          salary_min_ngn?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          closing_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          employment_type?: string
          id?: string
          location?: string | null
          notes?: string | null
          opening_count?: number
          requirements?: string | null
          salary_max_ngn?: number | null
          salary_min_ngn?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_openings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_article_versions: {
        Row: {
          article_id: string
          body: string
          id: string
          saved_at: string
          saved_by: string | null
          title: string
          version: number
        }
        Insert: {
          article_id: string
          body: string
          id?: string
          saved_at?: string
          saved_by?: string | null
          title: string
          version: number
        }
        Update: {
          article_id?: string
          body?: string
          id?: string
          saved_at?: string
          saved_by?: string | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_versions_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "knowledge_article_versions_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "knowledge_article_versions_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          author_id: string | null
          body: string
          category: string
          created_at: string
          id: string
          published: boolean
          slug: string | null
          title: string
          updated_at: string
          updated_by: string | null
          version: number
          visible_to_roles: string[]
        }
        Insert: {
          author_id?: string | null
          body?: string
          category?: string
          created_at?: string
          id?: string
          published?: boolean
          slug?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visible_to_roles?: string[]
        }
        Update: {
          author_id?: string | null
          body?: string
          category?: string
          created_at?: string
          id?: string
          published?: boolean
          slug?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visible_to_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "knowledge_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "knowledge_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "knowledge_articles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "knowledge_articles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          annual_quota: number
          annual_used: number
          carryover_days: number
          created_at: string
          employee_id: string
          id: string
          maternity_used: number
          paternity_used: number
          sick_used: number
          unpaid_used: number
          updated_at: string
          year: number
        }
        Insert: {
          annual_quota?: number
          annual_used?: number
          carryover_days?: number
          created_at?: string
          employee_id: string
          id?: string
          maternity_used?: number
          paternity_used?: number
          sick_used?: number
          unpaid_used?: number
          updated_at?: string
          year: number
        }
        Update: {
          annual_quota?: number
          annual_used?: number
          carryover_days?: number
          created_at?: string
          employee_id?: string
          id?: string
          maternity_used?: number
          paternity_used?: number
          sick_used?: number
          unpaid_used?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days_requested: number
          deleted_at: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          rejection_reason: string | null
          resubmitted_from_id: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_requested: number
          deleted_at?: string | null
          employee_id: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          rejection_reason?: string | null
          resubmitted_from_id?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_requested?: number
          deleted_at?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          rejection_reason?: string | null
          resubmitted_from_id?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_resubmitted_from_id_fkey"
            columns: ["resubmitted_from_id"]
            isOneToOne: false
            referencedRelation: "leave_calendar_v"
            referencedColumns: ["leave_id"]
          },
          {
            foreignKeyName: "leave_requests_resubmitted_from_id_fkey"
            columns: ["resubmitted_from_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_repayments: {
        Row: {
          amount_ngn: number
          created_at: string
          id: string
          loan_id: string
          method: string
          notes: string | null
          paid_date: string
          recorded_by: string | null
        }
        Insert: {
          amount_ngn: number
          created_at?: string
          id?: string
          loan_id: string
          method?: string
          notes?: string | null
          paid_date?: string
          recorded_by?: string | null
        }
        Update: {
          amount_ngn?: number
          created_at?: string
          id?: string
          loan_id?: string
          method?: string
          notes?: string | null
          paid_date?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          digest_frequency: string
          email_approvals: boolean
          email_compliance: boolean
          email_expenses: boolean
          email_fleet: boolean
          email_leave: boolean
          email_payments: boolean
          in_app_sound: boolean
          sms_approvals: boolean
          sms_compliance: boolean
          sms_ewa: boolean
          sms_leave: boolean
          sms_payments: boolean
          sms_payslip: boolean
          updated_at: string
          user_id: string
          whatsapp_approvals: boolean
          whatsapp_compliance: boolean
          whatsapp_ewa: boolean
          whatsapp_leave: boolean
          whatsapp_payments: boolean
          whatsapp_payslip: boolean
        }
        Insert: {
          digest_frequency?: string
          email_approvals?: boolean
          email_compliance?: boolean
          email_expenses?: boolean
          email_fleet?: boolean
          email_leave?: boolean
          email_payments?: boolean
          in_app_sound?: boolean
          sms_approvals?: boolean
          sms_compliance?: boolean
          sms_ewa?: boolean
          sms_leave?: boolean
          sms_payments?: boolean
          sms_payslip?: boolean
          updated_at?: string
          user_id: string
          whatsapp_approvals?: boolean
          whatsapp_compliance?: boolean
          whatsapp_ewa?: boolean
          whatsapp_leave?: boolean
          whatsapp_payments?: boolean
          whatsapp_payslip?: boolean
        }
        Update: {
          digest_frequency?: string
          email_approvals?: boolean
          email_compliance?: boolean
          email_expenses?: boolean
          email_fleet?: boolean
          email_leave?: boolean
          email_payments?: boolean
          in_app_sound?: boolean
          sms_approvals?: boolean
          sms_compliance?: boolean
          sms_ewa?: boolean
          sms_leave?: boolean
          sms_payments?: boolean
          sms_payslip?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_approvals?: boolean
          whatsapp_compliance?: boolean
          whatsapp_ewa?: boolean
          whatsapp_leave?: boolean
          whatsapp_payments?: boolean
          whatsapp_payslip?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          link: string | null
          module: string | null
          priority: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          module?: string | null
          priority?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          module?: string | null
          priority?: string | null
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
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string | null
          payload: Json | null
          provider_id: string | null
          sent_at: string | null
          status: string
          template_kind: string
          to_address: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          template_kind: string
          to_address?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          template_kind?: string
          to_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "notifications_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "notifications_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklists: {
        Row: {
          checklist_type: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          target_completion_date: string | null
          updated_at: string
        }
        Insert: {
          checklist_type: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          target_completion_date?: string | null
          updated_at?: string
        }
        Update: {
          checklist_type?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          target_completion_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_items: {
        Row: {
          assigned_to: string | null
          category: string
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          sort_order: number
          title: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "onboarding_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          pay_schedule_id: string | null
          role_filter: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          pay_schedule_id?: string | null
          role_filter?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pay_schedule_id?: string | null
          role_filter?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "pay_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "pay_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_groups_pay_schedule_id_fkey"
            columns: ["pay_schedule_id"]
            isOneToOne: false
            referencedRelation: "pay_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_schedule_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff_json: Json | null
          id: string
          pay_schedule_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff_json?: Json | null
          id?: string
          pay_schedule_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff_json?: Json | null
          id?: string
          pay_schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_schedule_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "pay_schedule_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "pay_schedule_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_schedule_audit_pay_schedule_id_fkey"
            columns: ["pay_schedule_id"]
            isOneToOne: false
            referencedRelation: "pay_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_schedules: {
        Row: {
          anchor_day: number
          auto_approve: boolean
          created_at: string
          created_by: string | null
          cutoff_lead_days: number
          day_adjustment: string
          frequency: string
          id: string
          is_active: boolean
          name: string
          notify_roles: string[]
          processing_lead_days: number
          second_anchor_day: number | null
          updated_at: string
        }
        Insert: {
          anchor_day?: number
          auto_approve?: boolean
          created_at?: string
          created_by?: string | null
          cutoff_lead_days?: number
          day_adjustment?: string
          frequency: string
          id?: string
          is_active?: boolean
          name: string
          notify_roles?: string[]
          processing_lead_days?: number
          second_anchor_day?: number | null
          updated_at?: string
        }
        Update: {
          anchor_day?: number
          auto_approve?: boolean
          created_at?: string
          created_by?: string | null
          cutoff_lead_days?: number
          day_adjustment?: string
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          notify_roles?: string[]
          processing_lead_days?: number
          second_anchor_day?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "pay_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "pay_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_anomalies: {
        Row: {
          amount_ngn: number | null
          description: string
          detected_at: string
          employee_id: string | null
          evidence_json: Json
          ewa_request_id: string | null
          fingerprint: string
          id: string
          module: string
          payment_batch_id: string | null
          payroll_run_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          rule_code: string
          severity: string
          status: string
          subject_id: string
          subject_type: string
          title: string
        }
        Insert: {
          amount_ngn?: number | null
          description: string
          detected_at?: string
          employee_id?: string | null
          evidence_json?: Json
          ewa_request_id?: string | null
          fingerprint: string
          id?: string
          module: string
          payment_batch_id?: string | null
          payroll_run_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          rule_code: string
          severity: string
          status?: string
          subject_id: string
          subject_type: string
          title: string
        }
        Update: {
          amount_ngn?: number | null
          description?: string
          detected_at?: string
          employee_id?: string | null
          evidence_json?: Json
          ewa_request_id?: string | null
          fingerprint?: string
          id?: string
          module?: string
          payment_batch_id?: string | null
          payroll_run_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          rule_code?: string
          severity?: string
          status?: string
          subject_id?: string
          subject_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_anomalies_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_anomalies_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_anomalies_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_anomalies_ewa_request_id_fkey"
            columns: ["ewa_request_id"]
            isOneToOne: false
            referencedRelation: "ewa_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_anomalies_payment_batch_id_fkey"
            columns: ["payment_batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_anomalies_payment_batch_id_fkey"
            columns: ["payment_batch_id"]
            isOneToOne: false
            referencedRelation: "transactions_view"
            referencedColumns: ["parent_batch_id"]
          },
          {
            foreignKeyName: "payment_anomalies_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_anomalies_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_anomalies_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_anomalies_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_batches: {
        Row: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        Insert: {
          advance_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          batch_type?: string | null
          beneficiary_count?: number
          bonus_type?: string | null
          co_approval_required?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          funded_at?: string | null
          funded_by?: string | null
          funding_evidence?: Json | null
          fx_base?: string | null
          fx_quote?: string | null
          fx_rate_used?: number | null
          id?: string
          is_quick_pay?: boolean | null
          name: string
          notes?: string | null
          payload_hash_at_approval?: string | null
          payment_category?: string | null
          payment_date: string
          payment_description?: string | null
          payment_narration_at_dispatch?: string | null
          period?: string | null
          processing_finalized_at?: string | null
          processing_started_at?: string | null
          provider?: string | null
          recurring_schedule_id?: string | null
          rejection_reason?: string | null
          repayment_months?: number
          scheduled_date?: string | null
          second_approved_at?: string | null
          second_approver_id?: string | null
          status?: string
          total_amount?: number
        }
        Update: {
          advance_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          batch_type?: string | null
          beneficiary_count?: number
          bonus_type?: string | null
          co_approval_required?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          funded_at?: string | null
          funded_by?: string | null
          funding_evidence?: Json | null
          fx_base?: string | null
          fx_quote?: string | null
          fx_rate_used?: number | null
          id?: string
          is_quick_pay?: boolean | null
          name?: string
          notes?: string | null
          payload_hash_at_approval?: string | null
          payment_category?: string | null
          payment_date?: string
          payment_description?: string | null
          payment_narration_at_dispatch?: string | null
          period?: string | null
          processing_finalized_at?: string | null
          processing_started_at?: string | null
          provider?: string | null
          recurring_schedule_id?: string | null
          rejection_reason?: string | null
          repayment_months?: number
          scheduled_date?: string | null
          second_approved_at?: string | null
          second_approver_id?: string | null
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
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
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_batches_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_batches_funded_by_fkey"
            columns: ["funded_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_funded_by_fkey"
            columns: ["funded_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_funded_by_fkey"
            columns: ["funded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_batches_recurring_schedule_id_fkey"
            columns: ["recurring_schedule_id"]
            isOneToOne: false
            referencedRelation: "recurring_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_batches_second_approver_id_fkey"
            columns: ["second_approver_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_second_approver_id_fkey"
            columns: ["second_approver_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_second_approver_id_fkey"
            columns: ["second_approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_run_items: {
        Row: {
          created_at: string
          employee_id: string | null
          employee_name: string
          gross_ngn: number
          id: string
          net_ngn: number
          nhf_ngn: number
          paye_ngn: number
          payroll_run_id: string
          pension_ngn: number
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          employee_name: string
          gross_ngn?: number
          id?: string
          net_ngn?: number
          nhf_ngn?: number
          paye_ngn?: number
          payroll_run_id: string
          pension_ngn?: number
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          employee_name?: string
          gross_ngn?: number
          id?: string
          net_ngn?: number
          nhf_ngn?: number
          paye_ngn?: number
          payroll_run_id?: string
          pension_ngn?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_run_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payroll_run_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payroll_run_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_run_variance: {
        Row: {
          computed_at: string
          current_burn_ngn: number | null
          payroll_run_id: string
          prior_burn_ngn: number | null
          prior_period: string | null
          reason: string | null
          severity: string | null
          variance_pct: number | null
        }
        Insert: {
          computed_at?: string
          current_burn_ngn?: number | null
          payroll_run_id: string
          prior_burn_ngn?: number | null
          prior_period?: string | null
          reason?: string | null
          severity?: string | null
          variance_pct?: number | null
        }
        Update: {
          computed_at?: string
          current_burn_ngn?: number | null
          payroll_run_id?: string
          prior_burn_ngn?: number | null
          prior_period?: string | null
          reason?: string | null
          severity?: string | null
          variance_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_run_variance_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: true
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          allowances_json: Json | null
          approved_by: string | null
          bonuses_json: Json | null
          created_at: string
          created_by: string | null
          cutoff_date: string | null
          employee_count: number | null
          id: string
          is_auto_generated: boolean
          nhf_ngn: number
          notes: string | null
          pay_date: string | null
          pay_group_id: string | null
          pay_schedule_id: string | null
          paye_ngn: number
          pension_ngn: number
          period: string
          period_type: string | null
          run_type: string
          status: string
          total_burn_ngn: number
          total_contractor_ngn: number
          total_employee_ngn: number
          total_expenses_ngn: number
          updated_at: string
        }
        Insert: {
          allowances_json?: Json | null
          approved_by?: string | null
          bonuses_json?: Json | null
          created_at?: string
          created_by?: string | null
          cutoff_date?: string | null
          employee_count?: number | null
          id?: string
          is_auto_generated?: boolean
          nhf_ngn?: number
          notes?: string | null
          pay_date?: string | null
          pay_group_id?: string | null
          pay_schedule_id?: string | null
          paye_ngn?: number
          pension_ngn?: number
          period: string
          period_type?: string | null
          run_type?: string
          status?: string
          total_burn_ngn?: number
          total_contractor_ngn?: number
          total_employee_ngn?: number
          total_expenses_ngn?: number
          updated_at?: string
        }
        Update: {
          allowances_json?: Json | null
          approved_by?: string | null
          bonuses_json?: Json | null
          created_at?: string
          created_by?: string | null
          cutoff_date?: string | null
          employee_count?: number | null
          id?: string
          is_auto_generated?: boolean
          nhf_ngn?: number
          notes?: string | null
          pay_date?: string | null
          pay_group_id?: string | null
          pay_schedule_id?: string | null
          paye_ngn?: number
          pension_ngn?: number
          period?: string
          period_type?: string | null
          run_type?: string
          status?: string
          total_burn_ngn?: number
          total_contractor_ngn?: number
          total_employee_ngn?: number
          total_expenses_ngn?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_pay_group_id_fkey"
            columns: ["pay_group_id"]
            isOneToOne: false
            referencedRelation: "pay_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_pay_schedule_id_fkey"
            columns: ["pay_schedule_id"]
            isOneToOne: false
            referencedRelation: "pay_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_adjustments: {
        Row: {
          amount_ngn: number
          created_at: string
          created_by: string | null
          description: string
          employee_id: string
          id: string
          kind: string
          payroll_run_id: string
          taxable: boolean
        }
        Insert: {
          amount_ngn: number
          created_at?: string
          created_by?: string | null
          description: string
          employee_id: string
          id?: string
          kind: string
          payroll_run_id: string
          taxable?: boolean
        }
        Update: {
          amount_ngn?: number
          created_at?: string
          created_by?: string | null
          description?: string
          employee_id?: string
          id?: string
          kind?: string
          payroll_run_id?: string
          taxable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payslip_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payslip_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payslip_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payslip_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payslip_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_adjustments_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          batch_item_id: string | null
          created_at: string
          deductions_json: Json | null
          deductions_ngn: number | null
          employee_email: string | null
          employee_id: string | null
          employee_name: string
          generated_by: string | null
          gross_ngn: number
          id: string
          net_ngn: number
          nhf_ngn: number
          paye_ngn: number
          payroll_run_id: string | null
          pension_ngn: number
          period: string
          storage_path: string | null
        }
        Insert: {
          batch_item_id?: string | null
          created_at?: string
          deductions_json?: Json | null
          deductions_ngn?: number | null
          employee_email?: string | null
          employee_id?: string | null
          employee_name: string
          generated_by?: string | null
          gross_ngn?: number
          id?: string
          net_ngn?: number
          nhf_ngn?: number
          paye_ngn?: number
          payroll_run_id?: string | null
          pension_ngn?: number
          period: string
          storage_path?: string | null
        }
        Update: {
          batch_item_id?: string | null
          created_at?: string
          deductions_json?: Json | null
          deductions_ngn?: number | null
          employee_email?: string | null
          employee_id?: string | null
          employee_name?: string
          generated_by?: string | null
          gross_ngn?: number
          id?: string
          net_ngn?: number
          nhf_ngn?: number
          paye_ngn?: number
          payroll_run_id?: string | null
          pension_ngn?: number
          period?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payslips_batch_item_id_fkey"
            columns: ["batch_item_id"]
            isOneToOne: false
            referencedRelation: "batch_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_batch_item_id_fkey"
            columns: ["batch_item_id"]
            isOneToOne: false
            referencedRelation: "transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payslips_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payslips_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      paystack_reconciliation_runs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          items_checked: number | null
          items_failed: number | null
          items_succeeded: number | null
          items_unchanged: number | null
          notes: string | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          items_checked?: number | null
          items_failed?: number | null
          items_succeeded?: number | null
          items_unchanged?: number | null
          notes?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          items_checked?: number | null
          items_failed?: number | null
          items_succeeded?: number | null
          items_unchanged?: number | null
          notes?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paystack_reconciliation_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "paystack_reconciliation_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "paystack_reconciliation_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          phone: string | null
          role: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          phone?: string | null
          role: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          phone?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "pending_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "pending_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          acknowledged_at: string | null
          areas_for_growth: string | null
          created_at: string
          cycle_id: string
          development_plan: Json
          employee_id: string
          id: string
          overall_rating: number | null
          ratings: Json
          review_type: string
          reviewer_id: string
          status: string
          strengths: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          areas_for_growth?: string | null
          created_at?: string
          cycle_id: string
          development_plan?: Json
          employee_id: string
          id?: string
          overall_rating?: number | null
          ratings?: Json
          review_type: string
          reviewer_id: string
          status?: string
          strengths?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          areas_for_growth?: string | null
          created_at?: string
          cycle_id?: string
          development_plan?: Json
          employee_id?: string
          id?: string
          overall_rating?: number | null
          ratings?: Json
          review_type?: string
          reviewer_id?: string
          status?: string
          strengths?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "review_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_entries: {
        Row: {
          amount_ngn: number
          category: string | null
          created_at: string
          deleted_at: string | null
          entry_date: string
          entry_type: string
          fund_id: string
          id: string
          notes: string | null
          payee: string | null
          purpose: string
          receipt_url: string | null
          recorded_by: string | null
        }
        Insert: {
          amount_ngn: number
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          entry_date?: string
          entry_type: string
          fund_id: string
          id?: string
          notes?: string | null
          payee?: string | null
          purpose: string
          receipt_url?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount_ngn?: number
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          entry_date?: string
          entry_type?: string
          fund_id?: string
          id?: string
          notes?: string | null
          payee?: string | null
          purpose?: string
          receipt_url?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_entries_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "petty_cash_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_funds: {
        Row: {
          created_at: string
          created_by: string | null
          current_balance_ngn: number
          custodian_id: string | null
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          opening_balance_ngn: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_balance_ngn?: number
          custodian_id?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_balance_ngn?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_balance_ngn?: number
          custodian_id?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_balance_ngn?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_name: string | null
          account_number: string | null
          address: string | null
          annual_leave_days: number | null
          bank_account_modified_at: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_account_number_enc: string | null
          bank_code: string | null
          bank_name: string | null
          basic_ngn: number | null
          bvn_last4: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          department_id: string | null
          email: string | null
          employee_number: string | null
          employee_role: string | null
          employment_type: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          housing_ngn: number | null
          id: string
          is_anonymised: boolean | null
          job_title: string | null
          last_name: string | null
          marital_status: string | null
          next_of_kin_email: string | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          next_of_kin_relationship: string | null
          nhf_enabled: boolean | null
          nhf_number: string | null
          nhis_enabled: boolean | null
          nhis_number: string | null
          nin: string | null
          nin_last4: string | null
          onboarding_complete: boolean | null
          onboarding_steps: Json | null
          other_allowances_ngn: number | null
          pay_group_id: string | null
          paye_enabled: boolean | null
          paystack_recipient_code: string | null
          paystack_recipient_verified_at: string | null
          pension_enabled: boolean | null
          pension_pin: string | null
          permissions: Json | null
          pfa_code: string | null
          pfa_name: string | null
          phone: string | null
          photo_url: string | null
          probation_review_completed_at: string | null
          probation_review_notified_at: string | null
          referral_code: string | null
          reporting_manager_id: string | null
          role: string
          salary_ngn: number | null
          staff_number: string | null
          start_date: string | null
          state_of_residence: string | null
          status: string | null
          tags: string[] | null
          tax_id: string | null
          tenant_id: string | null
          timezone: string
          tin: string | null
          transport_ngn: number | null
          use_salary_components: boolean
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          address?: string | null
          annual_leave_days?: number | null
          bank_account_modified_at?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_account_number_enc?: string | null
          bank_code?: string | null
          bank_name?: string | null
          basic_ngn?: number | null
          bvn_last4?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          employee_number?: string | null
          employee_role?: string | null
          employment_type?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          housing_ngn?: number | null
          id: string
          is_anonymised?: boolean | null
          job_title?: string | null
          last_name?: string | null
          marital_status?: string | null
          next_of_kin_email?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          nhf_enabled?: boolean | null
          nhf_number?: string | null
          nhis_enabled?: boolean | null
          nhis_number?: string | null
          nin?: string | null
          nin_last4?: string | null
          onboarding_complete?: boolean | null
          onboarding_steps?: Json | null
          other_allowances_ngn?: number | null
          pay_group_id?: string | null
          paye_enabled?: boolean | null
          paystack_recipient_code?: string | null
          paystack_recipient_verified_at?: string | null
          pension_enabled?: boolean | null
          pension_pin?: string | null
          permissions?: Json | null
          pfa_code?: string | null
          pfa_name?: string | null
          phone?: string | null
          photo_url?: string | null
          probation_review_completed_at?: string | null
          probation_review_notified_at?: string | null
          referral_code?: string | null
          reporting_manager_id?: string | null
          role?: string
          salary_ngn?: number | null
          staff_number?: string | null
          start_date?: string | null
          state_of_residence?: string | null
          status?: string | null
          tags?: string[] | null
          tax_id?: string | null
          tenant_id?: string | null
          timezone?: string
          tin?: string | null
          transport_ngn?: number | null
          use_salary_components?: boolean
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          address?: string | null
          annual_leave_days?: number | null
          bank_account_modified_at?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_account_number_enc?: string | null
          bank_code?: string | null
          bank_name?: string | null
          basic_ngn?: number | null
          bvn_last4?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          employee_number?: string | null
          employee_role?: string | null
          employment_type?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          housing_ngn?: number | null
          id?: string
          is_anonymised?: boolean | null
          job_title?: string | null
          last_name?: string | null
          marital_status?: string | null
          next_of_kin_email?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          nhf_enabled?: boolean | null
          nhf_number?: string | null
          nhis_enabled?: boolean | null
          nhis_number?: string | null
          nin?: string | null
          nin_last4?: string | null
          onboarding_complete?: boolean | null
          onboarding_steps?: Json | null
          other_allowances_ngn?: number | null
          pay_group_id?: string | null
          paye_enabled?: boolean | null
          paystack_recipient_code?: string | null
          paystack_recipient_verified_at?: string | null
          pension_enabled?: boolean | null
          pension_pin?: string | null
          permissions?: Json | null
          pfa_code?: string | null
          pfa_name?: string | null
          phone?: string | null
          photo_url?: string | null
          probation_review_completed_at?: string | null
          probation_review_notified_at?: string | null
          referral_code?: string | null
          reporting_manager_id?: string | null
          role?: string
          salary_ngn?: number | null
          staff_number?: string | null
          start_date?: string | null
          state_of_residence?: string | null
          status?: string | null
          tags?: string[] | null
          tax_id?: string | null
          tenant_id?: string | null
          timezone?: string
          tin?: string | null
          transport_ngn?: number | null
          use_salary_components?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pay_group_id_fkey"
            columns: ["pay_group_id"]
            isOneToOne: false
            referencedRelation: "pay_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          project_id: string
          sort_order: number
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          project_id: string
          sort_order?: number
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          project_id?: string
          sort_order?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget_ngn: number | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          priority: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget_ngn?: number | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          priority?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget_ngn?: number | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          priority?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_canary_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          provider: string
          reference: string | null
          started_at: string
          succeeded: boolean | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          provider: string
          reference?: string | null
          started_at?: string
          succeeded?: boolean | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          provider?: string
          reference?: string | null
          started_at?: string
          succeeded?: boolean | null
        }
        Relationships: []
      }
      provider_switches: {
        Row: {
          actor_ip_hash: string | null
          actor_user_agent: string | null
          auto: boolean
          from_provider: string
          id: string
          preflight_result: Json | null
          reason: string | null
          switched_at: string
          switched_by: string | null
          to_provider: string
        }
        Insert: {
          actor_ip_hash?: string | null
          actor_user_agent?: string | null
          auto?: boolean
          from_provider: string
          id?: string
          preflight_result?: Json | null
          reason?: string | null
          switched_at?: string
          switched_by?: string | null
          to_provider: string
        }
        Update: {
          actor_ip_hash?: string | null
          actor_user_agent?: string | null
          auto?: boolean
          from_provider?: string
          id?: string
          preflight_result?: Json | null
          reason?: string | null
          switched_at?: string
          switched_by?: string | null
          to_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_switches_switched_by_fkey"
            columns: ["switched_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "provider_switches_switched_by_fkey"
            columns: ["switched_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "provider_switches_switched_by_fkey"
            columns: ["switched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          country_code: string
          created_at: string
          holiday_date: string
          id: string
          is_observed: boolean
          name: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          holiday_date: string
          id?: string
          is_observed?: boolean
          name: string
        }
        Update: {
          country_code?: string
          created_at?: string
          holiday_date?: string
          id?: string
          is_observed?: boolean
          name?: string
        }
        Relationships: []
      }
      push_preferences: {
        Row: {
          announcements: boolean
          anomalies: boolean
          approvals: boolean
          schedules: boolean
          transfers: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          announcements?: boolean
          anomalies?: boolean
          approvals?: boolean
          schedules?: boolean
          transfers?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          announcements?: boolean
          anomalies?: boolean
          approvals?: boolean
          schedules?: boolean
          transfers?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "push_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "push_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          custom_interval_days: number | null
          day_of_month: number | null
          day_of_week: number | null
          frequency: string
          id: string
          last_run_date: string | null
          next_run_date: string
          source_batch_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_interval_days?: number | null
          day_of_month?: number | null
          day_of_week?: number | null
          frequency: string
          id?: string
          last_run_date?: string | null
          next_run_date: string
          source_batch_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_interval_days?: number | null
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string
          id?: string
          last_run_date?: string | null
          next_run_date?: string
          source_batch_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "recurring_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "recurring_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_schedules_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_schedules_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "transactions_view"
            referencedColumns: ["parent_batch_id"]
          },
        ]
      }
      referral_partners: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          manual_account_count: number | null
          notes: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          manual_account_count?: number | null
          notes?: string | null
          status?: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          manual_account_count?: number | null
          notes?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "referral_partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "referral_partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          account_start_date: string | null
          commission_earned_ngn: number
          commission_pct: number
          converted_at: string | null
          created_at: string
          id: string
          is_affiliate: boolean
          referral_partner_id: string | null
          referred_email: string
          referred_user_id: string | null
          referrer_contractor_id: string | null
          referrer_id: string
          status: string
        }
        Insert: {
          account_start_date?: string | null
          commission_earned_ngn?: number
          commission_pct?: number
          converted_at?: string | null
          created_at?: string
          id?: string
          is_affiliate?: boolean
          referral_partner_id?: string | null
          referred_email: string
          referred_user_id?: string | null
          referrer_contractor_id?: string | null
          referrer_id: string
          status?: string
        }
        Update: {
          account_start_date?: string | null
          commission_earned_ngn?: number
          commission_pct?: number
          converted_at?: string | null
          created_at?: string
          id?: string
          is_affiliate?: boolean
          referral_partner_id?: string | null
          referred_email?: string
          referred_user_id?: string | null
          referrer_contractor_id?: string | null
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referral_partner_id_fkey"
            columns: ["referral_partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_contractor_id_fkey"
            columns: ["referrer_contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          all_paused: boolean
          created_at: string
          data_type: string
          enabled_at: string | null
          enabled_by: string | null
          id: string
          last_run_at: string | null
          last_run_count: number | null
          last_run_status: string | null
          mode: string
          notes: string | null
          retention_days: number
          scheduled_first_run_at: string | null
          updated_at: string
        }
        Insert: {
          all_paused?: boolean
          created_at?: string
          data_type: string
          enabled_at?: string | null
          enabled_by?: string | null
          id?: string
          last_run_at?: string | null
          last_run_count?: number | null
          last_run_status?: string | null
          mode?: string
          notes?: string | null
          retention_days?: number
          scheduled_first_run_at?: string | null
          updated_at?: string
        }
        Update: {
          all_paused?: boolean
          created_at?: string
          data_type?: string
          enabled_at?: string | null
          enabled_by?: string | null
          id?: string
          last_run_at?: string | null
          last_run_count?: number | null
          last_run_status?: string | null
          mode?: string
          notes?: string | null
          retention_days?: number
          scheduled_first_run_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_policies_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "retention_policies_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "retention_policies_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_runs: {
        Row: {
          archive_path: string | null
          completed_at: string | null
          cutoff_date: string
          data_type: string
          error_message: string | null
          id: string
          items_archived: number | null
          items_deleted: number | null
          mode: string
          policy_id: string | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          archive_path?: string | null
          completed_at?: string | null
          cutoff_date: string
          data_type: string
          error_message?: string | null
          id?: string
          items_archived?: number | null
          items_deleted?: number | null
          mode: string
          policy_id?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          archive_path?: string | null
          completed_at?: string | null
          cutoff_date?: string
          data_type?: string
          error_message?: string | null
          id?: string
          items_archived?: number | null
          items_deleted?: number | null
          mode?: string
          policy_id?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_runs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "retention_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "retention_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "retention_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_entries: {
        Row: {
          amount_ngn: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          month: string
          notes: string | null
        }
        Insert: {
          amount_ngn?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          month: string
          notes?: string | null
        }
        Update: {
          amount_ngn?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          month?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "revenue_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "revenue_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_cycles: {
        Row: {
          created_at: string
          created_by: string | null
          cycle_type: string
          due_date: string
          id: string
          name: string
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cycle_type: string
          due_date: string
          id?: string
          name: string
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cycle_type?: string
          due_date?: string
          id?: string
          name?: string
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      salary_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          effective_date: string
          employee_id: string
          id: string
          new_basic_ngn: number | null
          new_housing_ngn: number | null
          new_other_ngn: number | null
          new_salary_ngn: number | null
          new_transport_ngn: number | null
          old_basic_ngn: number | null
          old_housing_ngn: number | null
          old_other_ngn: number | null
          old_salary_ngn: number | null
          old_transport_ngn: number | null
          reason: string | null
        }
        Insert: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          effective_date?: string
          employee_id: string
          id?: string
          new_basic_ngn?: number | null
          new_housing_ngn?: number | null
          new_other_ngn?: number | null
          new_salary_ngn?: number | null
          new_transport_ngn?: number | null
          old_basic_ngn?: number | null
          old_housing_ngn?: number | null
          old_other_ngn?: number | null
          old_salary_ngn?: number | null
          old_transport_ngn?: number | null
          reason?: string | null
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          effective_date?: string
          employee_id?: string
          id?: string
          new_basic_ngn?: number | null
          new_housing_ngn?: number | null
          new_other_ngn?: number | null
          new_salary_ngn?: number | null
          new_transport_ngn?: number | null
          old_basic_ngn?: number | null
          old_housing_ngn?: number | null
          old_other_ngn?: number | null
          old_salary_ngn?: number | null
          old_transport_ngn?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_increments: {
        Row: {
          approved_by: string | null
          created_at: string | null
          effective_date: string
          employee_id: string | null
          id: string
          new_salary_ngn: number
          old_salary_ngn: number
          reason: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          effective_date: string
          employee_id?: string | null
          id?: string
          new_salary_ngn: number
          old_salary_ngn: number
          reason?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          effective_date?: string
          employee_id?: string | null
          id?: string
          new_salary_ngn?: number
          old_salary_ngn?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_increments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_increments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_increments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_increments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_increments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_increments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_filters: {
        Row: {
          created_at: string
          filters: Json
          id: string
          module: string
          name: string
          shared: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          module?: string
          name: string
          shared?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          module?: string
          name?: string
          shared?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_filters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "saved_filters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "saved_filters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_entries: {
        Row: {
          amount_ngn: number
          created_at: string
          description: string | null
          direction: string
          entry_date: string
          id: string
          matched_at: string | null
          matched_by: string | null
          matched_id: string | null
          matched_type: string | null
          reference: string | null
          statement_id: string
        }
        Insert: {
          amount_ngn: number
          created_at?: string
          description?: string | null
          direction: string
          entry_date: string
          id?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_id?: string | null
          matched_type?: string | null
          reference?: string | null
          statement_id: string
        }
        Update: {
          amount_ngn?: number
          created_at?: string
          description?: string | null
          direction?: string
          entry_date?: string
          id?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_id?: string | null
          matched_type?: string | null
          reference?: string | null
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_entries_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "statement_entries_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "statement_entries_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_entries_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_ngn: number
          billing_cycle: string
          category: string
          created_at: string | null
          created_by: string | null
          department_id: string | null
          id: string
          last_renewed_at: string | null
          name: string
          next_billing_date: string | null
          next_renewal_date: string | null
          notes: string | null
          owner_id: string | null
          status: string
          vendor: string | null
        }
        Insert: {
          amount_ngn?: number
          billing_cycle?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          id?: string
          last_renewed_at?: string | null
          name: string
          next_billing_date?: string | null
          next_renewal_date?: string | null
          notes?: string | null
          owner_id?: string | null
          status?: string
          vendor?: string | null
        }
        Update: {
          amount_ngn?: number
          billing_cycle?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          id?: string
          last_renewed_at?: string | null
          name?: string
          next_billing_date?: string | null
          next_renewal_date?: string | null
          notes?: string | null
          owner_id?: string | null
          status?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category: string | null
          color: string | null
          created_at: string | null
          created_by: string | null
          id: string
          module: string
          name: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          module?: string
          name: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          module?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          attachment_url: string | null
          blocked_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          project_id: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          attachment_url?: string | null
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          attachment_url?: string | null
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          custom_domain: string | null
          id: string
          logo_url: string | null
          name: string
          plan: string
          primary_color: string | null
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          primary_color?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          primary_color?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      terminations: {
        Row: {
          completed_at: string | null
          created_at: string
          employee_id: string
          exit_interview_notes: string | null
          final_settlement_ngn: number | null
          id: string
          initiated_by: string | null
          last_working_day: string | null
          notice_date: string | null
          reason: string | null
          rehire_eligible: boolean
          status: string
          termination_type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          employee_id: string
          exit_interview_notes?: string | null
          final_settlement_ngn?: number | null
          id?: string
          initiated_by?: string | null
          last_working_day?: string | null
          notice_date?: string | null
          reason?: string | null
          rehire_eligible?: boolean
          status?: string
          termination_type: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          employee_id?: string
          exit_interview_notes?: string | null
          final_settlement_ngn?: number | null
          id?: string
          initiated_by?: string | null
          last_working_day?: string | null
          notice_date?: string | null
          reason?: string | null
          rehire_eligible?: boolean
          status?: string
          termination_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "terminations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "terminations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminations_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "terminations_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "terminations_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_records: {
        Row: {
          category: string
          certificate_url: string | null
          completion_date: string | null
          cost_ngn: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          employee_id: string
          expiry_date: string | null
          id: string
          is_mandatory: boolean
          notes: string | null
          provider: string | null
          record_type: string
          score: string | null
          start_date: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          certificate_url?: string | null
          completion_date?: string | null
          cost_ngn?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employee_id: string
          expiry_date?: string | null
          id?: string
          is_mandatory?: boolean
          notes?: string | null
          provider?: string | null
          record_type: string
          score?: string | null
          start_date: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          certificate_url?: string | null
          completion_date?: string | null
          cost_ngn?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employee_id?: string
          expiry_date?: string | null
          id?: string
          is_mandatory?: boolean
          notes?: string | null
          provider?: string | null
          record_type?: string
          score?: string | null
          start_date?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      transfer_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          amount_ngn: number | null
          created_at: string
          id: string
          ip_hash: string | null
          metadata: Json
          outcome: string
          provider: string | null
          reason: string | null
          recipient_code: string | null
          reference: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          amount_ngn?: number | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          outcome?: string
          provider?: string | null
          reason?: string | null
          recipient_code?: string | null
          reference?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          amount_ngn?: number | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          outcome?: string
          provider?: string | null
          reason?: string | null
          recipient_code?: string | null
          reference?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "transfer_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "transfer_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_limits: {
        Row: {
          co_approval_threshold_ngn: number | null
          created_at: string
          daily_limit_ngn: number | null
          expires_at: string | null
          granted_by: string | null
          granted_reason: string | null
          id: string
          monthly_limit_ngn: number | null
          notes: string | null
          role: string | null
          single_batch_limit_ngn: number | null
          single_txn_limit_ngn: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          co_approval_threshold_ngn?: number | null
          created_at?: string
          daily_limit_ngn?: number | null
          expires_at?: string | null
          granted_by?: string | null
          granted_reason?: string | null
          id?: string
          monthly_limit_ngn?: number | null
          notes?: string | null
          role?: string | null
          single_batch_limit_ngn?: number | null
          single_txn_limit_ngn?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          co_approval_threshold_ngn?: number | null
          created_at?: string
          daily_limit_ngn?: number | null
          expires_at?: string | null
          granted_by?: string | null
          granted_reason?: string | null
          id?: string
          monthly_limit_ngn?: number | null
          notes?: string | null
          role?: string | null
          single_batch_limit_ngn?: number | null
          single_txn_limit_ngn?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_limits_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "transfer_limits_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "transfer_limits_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "transfer_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "transfer_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_limits_history: {
        Row: {
          after_row: Json | null
          before_row: Json | null
          change_kind: string
          changed_at: string
          changed_by: string | null
          id: string
          ip_hash: string | null
          limit_id: string | null
          user_agent: string | null
        }
        Insert: {
          after_row?: Json | null
          before_row?: Json | null
          change_kind: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          ip_hash?: string | null
          limit_id?: string | null
          user_agent?: string | null
        }
        Update: {
          after_row?: Json | null
          before_row?: Json | null
          change_kind?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          ip_hash?: string | null
          limit_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_limits_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "transfer_limits_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "transfer_limits_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_limits_history_limit_id_fkey"
            columns: ["limit_id"]
            isOneToOne: false
            referencedRelation: "transfer_limits"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_breadcrumbs: {
        Row: {
          accuracy: number | null
          heading: number | null
          id: string
          is_speeding: boolean | null
          lat: number
          lng: number
          recorded_at: string
          speed_kmh: number | null
          trip_id: string
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          is_speeding?: boolean | null
          lat: number
          lng: number
          recorded_at?: string
          speed_kmh?: number | null
          trip_id: string
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          is_speeding?: boolean | null
          lat?: number
          lng?: number
          recorded_at?: string
          speed_kmh?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_breadcrumbs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_events: {
        Row: {
          details: string | null
          event_type: string
          id: string
          lat: number | null
          lng: number | null
          recorded_at: string
          speed_kmh: number | null
          trip_id: string
        }
        Insert: {
          details?: string | null
          event_type: string
          id?: string
          lat?: number | null
          lng?: number | null
          recorded_at?: string
          speed_kmh?: number | null
          trip_id: string
        }
        Update: {
          details?: string | null
          event_type?: string
          id?: string
          lat?: number | null
          lng?: number | null
          recorded_at?: string
          speed_kmh?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_logs: {
        Row: {
          anomaly_reason: string | null
          anomaly_review_note: string | null
          anomaly_reviewed_at: string | null
          anomaly_reviewed_by: string | null
          created_at: string
          date: string
          driver_id: string
          duration_minutes: number | null
          end_lat: number | null
          end_lng: number | null
          end_location: string
          fuel_amount_ngn: number | null
          id: string
          is_anomaly: boolean | null
          is_out_of_area: boolean
          issues: string | null
          km_driven: number | null
          litres: number | null
          odometer_end: number | null
          odometer_start: number | null
          receipt_url: string | null
          start_lat: number | null
          start_lng: number | null
          start_location: string
          status: string | null
          trip_end_time: string | null
          trip_start_time: string | null
          vehicle_id: string | null
        }
        Insert: {
          anomaly_reason?: string | null
          anomaly_review_note?: string | null
          anomaly_reviewed_at?: string | null
          anomaly_reviewed_by?: string | null
          created_at?: string
          date: string
          driver_id: string
          duration_minutes?: number | null
          end_lat?: number | null
          end_lng?: number | null
          end_location?: string
          fuel_amount_ngn?: number | null
          id?: string
          is_anomaly?: boolean | null
          is_out_of_area?: boolean
          issues?: string | null
          km_driven?: number | null
          litres?: number | null
          odometer_end?: number | null
          odometer_start?: number | null
          receipt_url?: string | null
          start_lat?: number | null
          start_lng?: number | null
          start_location?: string
          status?: string | null
          trip_end_time?: string | null
          trip_start_time?: string | null
          vehicle_id?: string | null
        }
        Update: {
          anomaly_reason?: string | null
          anomaly_review_note?: string | null
          anomaly_reviewed_at?: string | null
          anomaly_reviewed_by?: string | null
          created_at?: string
          date?: string
          driver_id?: string
          duration_minutes?: number | null
          end_lat?: number | null
          end_lng?: number | null
          end_location?: string
          fuel_amount_ngn?: number | null
          id?: string
          is_anomaly?: boolean | null
          is_out_of_area?: boolean
          issues?: string | null
          km_driven?: number | null
          litres?: number | null
          odometer_end?: number | null
          odometer_start?: number | null
          receipt_url?: string | null
          start_lat?: number | null
          start_lng?: number | null
          start_location?: string
          status?: string | null
          trip_end_time?: string | null
          trip_start_time?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "trip_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
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
      trusted_devices: {
        Row: {
          created_at: string
          device_id: string
          id: string
          ip_hash: string | null
          label: string | null
          last_seen_at: string
          trusted_until: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          ip_hash?: string | null
          label?: string | null
          last_seen_at?: string
          trusted_until: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          ip_hash?: string | null
          label?: string | null
          last_seen_at?: string
          trusted_until?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vehicle_maintenance: {
        Row: {
          cost_ngn: number | null
          created_at: string
          id: string
          logged_by: string | null
          next_service_due: string | null
          notes: string | null
          odometer: number | null
          service_date: string
          service_type: string
          vehicle_id: string
        }
        Insert: {
          cost_ngn?: number | null
          created_at?: string
          id?: string
          logged_by?: string | null
          next_service_due?: string | null
          notes?: string | null
          odometer?: number | null
          service_date: string
          service_type: string
          vehicle_id: string
        }
        Update: {
          cost_ngn?: number | null
          created_at?: string
          id?: string
          logged_by?: string | null
          next_service_due?: string | null
          notes?: string | null
          odometer?: number | null
          service_date?: string
          service_type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_vehicle_id_fkey"
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
          avg_km_per_litre: number
          carry_forward_ngn: number
          color: string | null
          created_at: string
          current_fuel_litres: number
          fuel_consumption_rate_lkm: number
          home_base_lat: number | null
          home_base_lng: number | null
          id: string
          insurance_expiry: string | null
          last_refuel_at: string | null
          last_service_date: string | null
          make_model: string | null
          name: string
          next_service_date: string | null
          notes: string | null
          out_of_service_until: string | null
          plate_number: string
          road_worthiness_expiry: string | null
          status: string
          tank_capacity_litres: number
          updated_at: string | null
          vin: string | null
          weekly_budget_ngn: number
          year: number | null
        }
        Insert: {
          assigned_driver_id?: string | null
          avg_km_per_litre?: number
          carry_forward_ngn?: number
          color?: string | null
          created_at?: string
          current_fuel_litres?: number
          fuel_consumption_rate_lkm?: number
          home_base_lat?: number | null
          home_base_lng?: number | null
          id?: string
          insurance_expiry?: string | null
          last_refuel_at?: string | null
          last_service_date?: string | null
          make_model?: string | null
          name: string
          next_service_date?: string | null
          notes?: string | null
          out_of_service_until?: string | null
          plate_number: string
          road_worthiness_expiry?: string | null
          status?: string
          tank_capacity_litres?: number
          updated_at?: string | null
          vin?: string | null
          weekly_budget_ngn?: number
          year?: number | null
        }
        Update: {
          assigned_driver_id?: string | null
          avg_km_per_litre?: number
          carry_forward_ngn?: number
          color?: string | null
          created_at?: string
          current_fuel_litres?: number
          fuel_consumption_rate_lkm?: number
          home_base_lat?: number | null
          home_base_lng?: number | null
          id?: string
          insurance_expiry?: string | null
          last_refuel_at?: string | null
          last_service_date?: string | null
          make_model?: string | null
          name?: string
          next_service_date?: string | null
          notes?: string | null
          out_of_service_until?: string | null
          plate_number?: string
          road_worthiness_expiry?: string | null
          status?: string
          tank_capacity_litres?: number
          updated_at?: string | null
          vin?: string | null
          weekly_budget_ngn?: number
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_account_number_enc: string | null
          bank_name: string | null
          category: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_end: string | null
          contract_start: string | null
          contract_value_ngn: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string
          rc_number: string | null
          status: string
          tin: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_account_number_enc?: string | null
          bank_name?: string | null
          category: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          contract_value_ngn?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string
          rc_number?: string | null
          status?: string
          tin?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_account_number_enc?: string | null
          bank_name?: string | null
          category?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          contract_value_ngn?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string
          rc_number?: string | null
          status?: string
          tin?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      virtual_cards: {
        Row: {
          assigned_to: string | null
          card_name: string
          created_at: string
          created_by: string | null
          current_spend_ngn: number
          id: string
          last_four: string | null
          monthly_limit_ngn: number
          notes: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          assigned_to?: string | null
          card_name: string
          created_at?: string
          created_by?: string | null
          current_spend_ngn?: number
          id?: string
          last_four?: string | null
          monthly_limit_ngn?: number
          notes?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          assigned_to?: string | null
          card_name?: string
          created_at?: string
          created_by?: string | null
          current_spend_ngn?: number
          id?: string
          last_four?: string | null
          monthly_limit_ngn?: number
          notes?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_cards_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "virtual_cards_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "virtual_cards_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "virtual_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "virtual_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_cards_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_idempotency: {
        Row: {
          event_type: string
          processed_at: string
          reference: string
        }
        Insert: {
          event_type: string
          processed_at?: string
          reference: string
        }
        Update: {
          event_type?: string
          processed_at?: string
          reference?: string
        }
        Relationships: []
      }
      whatsapp_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          group_type: string
          id: string
          invite_link: string | null
          member_count: number | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_type?: string
          id?: string
          invite_link?: string | null
          member_count?: number | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_type?: string
          id?: string
          invite_link?: string | null
          member_count?: number | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "whatsapp_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "whatsapp_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leave_calendar_v: {
        Row: {
          days_requested: number | null
          department_id: string | null
          department_name: string | null
          employee_email: string | null
          employee_id: string | null
          employee_name: string | null
          end_date: string | null
          leave_id: string | null
          leave_type: string | null
          reason: string | null
          start_date: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chart_v: {
        Row: {
          department_id: string | null
          department_name: string | null
          employee_email: string | null
          employee_id: string | null
          employee_name: string | null
          employee_title: string | null
          manager_email: string | null
          manager_id: string | null
          manager_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      probation_employees_v: {
        Row: {
          department_id: string | null
          department_name: string | null
          employee_email: string | null
          employee_id: string | null
          employee_name: string | null
          job_title: string | null
          manager_name: string | null
          probation_review_completed_at: string | null
          probation_review_notified_at: string | null
          reporting_manager_id: string | null
          review_due_date: string | null
          start_date: string | null
          state: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions_view: {
        Row: {
          account_name: string | null
          account_number: string | null
          amount_ngn: number | null
          approved_by: string | null
          bank_name: string | null
          batch_name: string | null
          beneficiary_count: number | null
          category: string | null
          contractor_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          employee_id: string | null
          failed_count: number | null
          id: string | null
          is_manually_resolved: boolean | null
          manual_resolution_method: string | null
          notes: string | null
          parent_batch_id: string | null
          payment_date: string | null
          paystack_fee_ngn: number | null
          receipt_url: string | null
          reference: string | null
          rejection_reason: string | null
          status: string | null
          succeeded_count: number | null
          txn_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_items_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "batch_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "batch_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
          },
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
            referencedRelation: "org_chart_v"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payment_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "probation_employees_v"
            referencedColumns: ["employee_id"]
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
      webhook_idempotency_metrics: {
        Row: {
          event_type: string | null
          newest: string | null
          oldest: string | null
          rows_24h: number | null
          rows_7d: number | null
          total_rows: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _derive_batch_status_from_items: {
        Args: { p_batch_id: string }
        Returns: string
      }
      _mirror_usd_rate: {
        Args: { p_base: string; p_quote: string; p_rate: number }
        Returns: undefined
      }
      activate_my_profile: { Args: never; Returns: undefined }
      approve_advance_request: {
        Args: { p_request_id: string }
        Returns: {
          advance_id: string | null
          amount_ngn: number
          created_at: string
          employee_id: string
          id: string
          reason: string | null
          rejection_reason: string | null
          repayment_months: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "advance_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_bank_account_change_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      approve_ewa: { Args: { p_request_id: string }; Returns: Json }
      approve_expense: {
        Args: { p_expense_id: string; p_idempotency_key?: string }
        Returns: {
          account_name: string | null
          account_number: string | null
          admin_note: string | null
          amount_ngn: number
          approved_at: string | null
          approved_by: string | null
          bank_name: string | null
          budget_category: string | null
          category: string
          co_approval_required: boolean
          created_at: string
          date: string
          deleted_at: string | null
          description: string | null
          fuel_request_id: string | null
          id: string
          is_reimbursement: boolean
          mileage_km: number | null
          payload_hash_at_approval: string | null
          payment_reference: string | null
          payment_status: string | null
          processed_at: string | null
          processed_by: string | null
          rate_per_km_ngn: number | null
          receipt_url: string | null
          rejection_reason: string | null
          resubmitted_from_id: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          submitted_by: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_payment_batch: {
        Args: { p_batch_id: string; p_idempotency_key?: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auto_populate_filings_from_payroll: {
        Args: { p_payroll_run_id: string }
        Returns: Json
      }
      batch_paid_amount_ngn: { Args: { p_batch_id: string }; Returns: number }
      cancel_advance_request: {
        Args: { p_request_id: string }
        Returns: {
          advance_id: string | null
          amount_ngn: number
          created_at: string
          employee_id: string
          id: string
          reason: string | null
          rejection_reason: string | null
          repayment_months: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "advance_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_batch_bulk: {
        Args: { p_batch_id: string; p_note?: string }
        Returns: Json
      }
      cancel_ewa: { Args: { p_request_id: string }; Returns: Json }
      canonical_batch_payload_hash: {
        Args: { p_batch_id: string }
        Returns: string
      }
      canonical_expense_payload_hash: {
        Args: { p_expense_id: string }
        Returns: string
      }
      chat_check_rate_limit: {
        Args: { p_max?: number; p_user: string; p_window_seconds?: number }
        Returns: boolean
      }
      check_probation_reviews_due: {
        Args: never
        Returns: {
          employees_notified: number
        }[]
      }
      check_transfer_caps:
        | {
            Args: { p_amount_ngn: number; p_user_id: string }
            Returns: {
              allowed: boolean
              applied_limit_kind: string
              applied_limit_ngn: number
              reason: string
              used_month_ngn: number
              used_today_ngn: number
            }[]
          }
        | {
            Args: {
              p_action?: string
              p_amount_ngn: number
              p_check_batch_cap?: boolean
              p_intent?: boolean
              p_ip_hash?: string
              p_user_agent?: string
              p_user_id: string
            }
            Returns: {
              allowed: boolean
              applied_limit_kind: string
              applied_limit_ngn: number
              intent_audit_id: string
              reason: string
              used_month_ngn: number
              used_today_ngn: number
            }[]
          }
      client_finalize_transfer: {
        Args: {
          p_event: string
          p_failure_reason: string
          p_paystack_fee_ngn?: number
          p_paystack_raw: Json
          p_reference: string
        }
        Returns: Json
      }
      complete_offboarding: {
        Args: { p_termination_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          employee_id: string
          exit_interview_notes: string | null
          final_settlement_ngn: number | null
          id: string
          initiated_by: string | null
          last_working_day: string | null
          notice_date: string | null
          reason: string | null
          rehire_eligible: boolean
          status: string
          termination_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "terminations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_employee_gross: {
        Args: { p_employee_id: string }
        Returns: {
          gross_monthly: number
          nhf_base_monthly: number
          pension_base_monthly: number
          using_components: boolean
        }[]
      }
      compute_ewa_eligibility: {
        Args: { p_employee_id?: string }
        Returns: Json
      }
      compute_payroll_variance: {
        Args: { p_run_id: string }
        Returns: undefined
      }
      confirm_second_approval: {
        Args: { p_batch_id: string; p_idempotency_key?: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_second_expense_approval: {
        Args: { p_expense_id: string; p_idempotency_key?: string }
        Returns: {
          account_name: string | null
          account_number: string | null
          admin_note: string | null
          amount_ngn: number
          approved_at: string | null
          approved_by: string | null
          bank_name: string | null
          budget_category: string | null
          category: string
          co_approval_required: boolean
          created_at: string
          date: string
          deleted_at: string | null
          description: string | null
          fuel_request_id: string | null
          id: string
          is_reimbursement: boolean
          mileage_km: number | null
          payload_hash_at_approval: string | null
          payment_reference: string | null
          payment_status: string | null
          processed_at: string | null
          processed_by: string | null
          rate_per_km_ngn: number | null
          receipt_url: string | null
          rejection_reason: string | null
          resubmitted_from_id: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          submitted_by: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_mfa_backup_code: { Args: { p_code: string }; Returns: boolean }
      create_expense_payment_batch: {
        Args: { p_expense_id: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_tenant_id: { Args: never; Returns: string }
      current_user_is_active: { Args: never; Returns: boolean }
      current_user_role: { Args: never; Returns: string }
      decrypt_account_number: { Args: { ciphertext: string }; Returns: string }
      decrypt_linkedin_password: {
        Args: { ciphertext: string }
        Returns: string
      }
      delete_transfer_limit: {
        Args: { p_id: string; p_ip_hash?: string; p_user_agent?: string }
        Returns: undefined
      }
      delete_user_completely: { Args: { user_id: string }; Returns: undefined }
      effective_co_approval_threshold: {
        Args: { p_user_id: string }
        Returns: number
      }
      encrypt_account_number: { Args: { plaintext: string }; Returns: string }
      encrypt_linkedin_password: {
        Args: { plaintext: string }
        Returns: string
      }
      ewa_max_draw_percent: { Args: never; Returns: number }
      ewa_min_draw_amount: { Args: never; Returns: number }
      finalize_batch: {
        Args: { p_batch_id: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      flag_awol_yesterday: {
        Args: never
        Returns: {
          employees_flagged: number
        }[]
      }
      fleet_weekly_budget_reset: { Args: never; Returns: undefined }
      fleet_weekly_digest: { Args: never; Returns: undefined }
      forecast_cashflow: {
        Args: { p_weeks?: number }
        Returns: {
          obligations: Json
          projected_balance_ngn: number
          projected_inflows_ngn: number
          projected_outflows_ngn: number
          runway_weeks_remaining: number
          week_start: string
        }[]
      }
      generate_mfa_backup_codes: { Args: never; Returns: string[] }
      get_batch_velocity_flags: {
        Args: { p_batch_id: string }
        Returns: {
          details: Json
          flag_type: string
          message: string
          severity: string
        }[]
      }
      get_current_rate: {
        Args: { p_base: string; p_quote: string }
        Returns: number
      }
      get_decrypted_account_number: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      get_eligible_approvers: {
        Args: {
          p_action_type: string
          p_creator_id: string
          p_first_approver_id?: string
          p_tier: string
        }
        Returns: {
          email: string
          full_name: string
          id: string
          role: string
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_outstanding_ewa_for_period: {
        Args: { p_employee_id: string; p_period: string }
        Returns: number
      }
      is_device_trusted: { Args: { p_device_id: string }; Returns: boolean }
      is_quick_pay_enabled: { Args: never; Returns: boolean }
      log_audit: {
        Args: {
          p_action_type: string
          p_description: string
          p_ip_hash?: string
          p_metadata?: Json
          p_user_agent?: string
        }
        Returns: string
      }
      mark_advance_request_paid: {
        Args: { p_request_id: string; p_start_period?: string }
        Returns: {
          advance_id: string | null
          amount_ngn: number
          created_at: string
          employee_id: string
          id: string
          reason: string | null
          rejection_reason: string | null
          repayment_months: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "advance_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_batch_funded: {
        Args: { p_batch_id: string; p_funding_evidence?: Json }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_batch_item_resolved: {
        Args: { p_item_id: string; p_method: string; p_note: string }
        Returns: undefined
      }
      mark_expense_paid: {
        Args: { p_batch_id: string; p_expense_id: string }
        Returns: {
          account_name: string | null
          account_number: string | null
          admin_note: string | null
          amount_ngn: number
          approved_at: string | null
          approved_by: string | null
          bank_name: string | null
          budget_category: string | null
          category: string
          co_approval_required: boolean
          created_at: string
          date: string
          deleted_at: string | null
          description: string | null
          fuel_request_id: string | null
          id: string
          is_reimbursement: boolean
          mileage_km: number | null
          payload_hash_at_approval: string | null
          payment_reference: string | null
          payment_status: string | null
          processed_at: string | null
          processed_by: string | null
          rate_per_km_ngn: number | null
          receipt_url: string | null
          rejection_reason: string | null
          resubmitted_from_id: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          submitted_by: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_chatbot_knowledge: {
        Args: { match_count?: number; query_text: string; user_role?: string }
        Returns: {
          content: string
          id: string
          similarity: number
          source: string
          title: string
        }[]
      }
      next_pay_dates: {
        Args: { p_count?: number; p_schedule_id: string }
        Returns: {
          adjusted_from: string
          cutoff_date: string
          draft_open_date: string
          holiday_name: string
          pay_date: string
        }[]
      }
      next_pay_dates_array: {
        Args: { p_count?: number; p_schedule_id: string }
        Returns: string[]
      }
      notify_expiring_overrides: { Args: never; Returns: number }
      paid_total_in_period: {
        Args: { p_end: string; p_start: string }
        Returns: number
      }
      pending_batches_list: {
        Args: never
        Returns: {
          approved_at: string
          beneficiary_count: number
          created_at: string
          effective_amount: number
          id: string
          name: string
          payment_date: string
          status: string
        }[]
      }
      pending_payouts_summary: {
        Args: never
        Returns: {
          batch_count: number
          month_pending_amount: number
          total_amount: number
        }[]
      }
      pending_pipeline_summary: {
        Args: never
        Returns: {
          batch_count: number
          total_amount: number
        }[]
      }
      process_flutterwave_webhook: {
        Args: {
          p_event: string
          p_failure_reason: string
          p_flutterwave_fee_ngn?: number
          p_flutterwave_raw: Json
          p_processed_at?: string
          p_reference: string
        }
        Returns: Json
      }
      process_paystack_webhook: {
        Args: {
          p_event: string
          p_failure_reason: string
          p_paystack_fee_ngn?: number
          p_paystack_raw: Json
          p_processed_at?: string
          p_reference: string
        }
        Returns: Json
      }
      process_recurring_schedules: { Args: never; Returns: undefined }
      purge_archived_payment_batches: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      purge_audit_rows: {
        Args: { p_ids: string[]; p_table: string }
        Returns: number
      }
      purge_old_webhook_idempotency: { Args: never; Returns: number }
      recent_bank_account_changes: {
        Args: { p_user_ids: string[]; p_window_hours?: number }
        Returns: {
          full_name: string
          hours_ago: number
          modified_at: string
          user_id: string
        }[]
      }
      record_fetched_fx_rate: {
        Args: {
          p_base: string
          p_quote: string
          p_rate: number
          p_source: string
        }
        Returns: {
          base: string
          created_at: string
          created_by: string | null
          deviation_pct: number | null
          fetched_at: string
          id: string
          note: string | null
          prev_rate: number | null
          quote: string
          rate: number
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          valid_from: string
        }
        SetofOptions: {
          from: "*"
          to: "fx_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_trusted_device: {
        Args: {
          p_days?: number
          p_device_id: string
          p_ip_hash: string
          p_label: string
          p_user_agent: string
        }
        Returns: undefined
      }
      reject_advance_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: {
          advance_id: string | null
          amount_ngn: number
          created_at: string
          employee_id: string
          id: string
          reason: string | null
          rejection_reason: string | null
          repayment_months: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "advance_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_bank_account_change_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      reject_ewa: {
        Args: { p_reason: string; p_request_id: string }
        Returns: Json
      }
      reject_expense: {
        Args: { p_expense_id: string; p_reason: string }
        Returns: {
          account_name: string | null
          account_number: string | null
          admin_note: string | null
          amount_ngn: number
          approved_at: string | null
          approved_by: string | null
          bank_name: string | null
          budget_category: string | null
          category: string
          co_approval_required: boolean
          created_at: string
          date: string
          deleted_at: string | null
          description: string | null
          fuel_request_id: string | null
          id: string
          is_reimbursement: boolean
          mileage_km: number | null
          payload_hash_at_approval: string | null
          payment_reference: string | null
          payment_status: string | null
          processed_at: string | null
          processed_by: string | null
          rate_per_km_ngn: number | null
          receipt_url: string | null
          rejection_reason: string | null
          resubmitted_from_id: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          submitted_by: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_payment_batch: {
        Args: { p_batch_id: string; p_reason: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_abandoned_intents: { Args: never; Returns: number }
      request_ewa: {
        Args: { p_amount_ngn: number; p_reason?: string }
        Returns: string
      }
      reset_batch_to_draft: {
        Args: { p_batch_id: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_anomaly: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: {
          amount_ngn: number | null
          description: string
          detected_at: string
          employee_id: string | null
          evidence_json: Json
          ewa_request_id: string | null
          fingerprint: string
          id: string
          module: string
          payment_batch_id: string | null
          payroll_run_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          rule_code: string
          severity: string
          status: string
          subject_id: string
          subject_type: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_anomalies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_fx_rate: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      scan_daily_anomalies: { Args: never; Returns: number }
      scan_ewa_anomalies: { Args: { p_ewa_id: string }; Returns: number }
      scan_payroll_run_anomalies: {
        Args: { p_run_id: string }
        Returns: number
      }
      scan_runway_anomalies: { Args: never; Returns: number }
      schedule_auto_draft: { Args: never; Returns: number }
      seed_invited_profile: {
        Args: {
          p_email: string
          p_full_name: string
          p_phone: string
          p_role: string
        }
        Returns: undefined
      }
      set_app_secret: {
        Args: { p_key: string; p_value: string }
        Returns: undefined
      }
      set_manual_fx_rate: {
        Args: {
          p_base: string
          p_note?: string
          p_quote: string
          p_rate: number
        }
        Returns: string
      }
      set_transfer_limit: {
        Args: {
          p_batch?: number
          p_co_approval?: number
          p_daily?: number
          p_expires_at?: string
          p_id?: string
          p_ip_hash?: string
          p_monthly?: number
          p_reason?: string
          p_role?: string
          p_single?: number
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: {
          co_approval_threshold_ngn: number | null
          created_at: string
          daily_limit_ngn: number | null
          expires_at: string | null
          granted_by: string | null
          granted_reason: string | null
          id: string
          monthly_limit_ngn: number | null
          notes: string | null
          role: string | null
          single_batch_limit_ngn: number | null
          single_txn_limit_ngn: number | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transfer_limits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_ewa_for_payroll: {
        Args: { p_payroll_run_id: string }
        Returns: number
      }
      snapshot_cash_balance: {
        Args: { p_source?: string }
        Returns: {
          cash_on_hand_ngn: number
          created_at: string
          external_monthly_burn_ngn: number
          id: string
          in_platform_30d_burn_ngn: number
          monthly_revenue_estimate_ngn: number
          net_monthly_burn_ngn: number
          runway_months_estimate: number | null
          source: string
          taken_by: string | null
          taken_on: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_balance_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      soft_delete_contact: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      soft_delete_contractor: {
        Args: { p_contractor_id: string }
        Returns: undefined
      }
      soft_delete_employee: { Args: { user_id: string }; Returns: undefined }
      soft_delete_payment_batch: {
        Args: { p_batch_id: string; p_reason?: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_batch_processing: {
        Args: { p_batch_id: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_batch_status_from_items: {
        Args: { p_batch_id: string }
        Returns: {
          advance_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_type: string | null
          beneficiary_count: number
          bonus_type: string | null
          co_approval_required: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          funded_at: string | null
          funded_by: string | null
          funding_evidence: Json | null
          fx_base: string | null
          fx_quote: string | null
          fx_rate_used: number | null
          id: string
          is_quick_pay: boolean | null
          name: string
          notes: string | null
          payload_hash_at_approval: string | null
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_narration_at_dispatch: string | null
          period: string | null
          processing_finalized_at: string | null
          processing_started_at: string | null
          provider: string | null
          recurring_schedule_id: string | null
          rejection_reason: string | null
          repayment_months: number
          scheduled_date: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tick_batch_worker: { Args: never; Returns: undefined }
      tick_fx_rate_sync: { Args: never; Returns: undefined }
      tick_heyreach_sync: { Args: never; Returns: undefined }
      unresolve_batch_item: { Args: { p_item_id: string }; Returns: undefined }
      verify_audit_chain: {
        Args: never
        Returns: {
          action_type: string
          broken: boolean
          created_at: string
          expected_hash: string
          id: string
          seq: number
          stored_hash: string
        }[]
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
