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
    PostgrestVersion: "14.15"
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
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      availability_exceptions: {
        Row: {
          created_at: string
          exc_date: string
          exc_type: Database["public"]["Enums"]["exception_type"]
          house_id: string
          id: string
          leaves_at: string | null
          member_id: string
          reason: string | null
          returns_at: string | null
        }
        Insert: {
          created_at?: string
          exc_date: string
          exc_type: Database["public"]["Enums"]["exception_type"]
          house_id: string
          id?: string
          leaves_at?: string | null
          member_id: string
          reason?: string | null
          returns_at?: string | null
        }
        Update: {
          created_at?: string
          exc_date?: string
          exc_type?: Database["public"]["Enums"]["exception_type"]
          house_id?: string
          id?: string
          leaves_at?: string | null
          member_id?: string
          reason?: string | null
          returns_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_exceptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_assignments: {
        Row: {
          assignee_member_id: string | null
          auto_confirmed: boolean
          chore_date: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          deadline: string
          done_at: string | null
          duration_min: number
          effort_points: number
          guest_id: string | null
          house_id: string
          id: string
          photo_url: string | null
          rejected_by: string | null
          rejected_reason: string | null
          retry_count: number
          schedule_run_id: string | null
          slot: Database["public"]["Enums"]["chore_slot"]
          source: Database["public"]["Enums"]["assignment_source"]
          status: Database["public"]["Enums"]["assignment_status"]
          template_id: string
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          assignee_member_id?: string | null
          auto_confirmed?: boolean
          chore_date: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          deadline: string
          done_at?: string | null
          duration_min?: number
          effort_points: number
          guest_id?: string | null
          house_id: string
          id?: string
          photo_url?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          retry_count?: number
          schedule_run_id?: string | null
          slot: Database["public"]["Enums"]["chore_slot"]
          source?: Database["public"]["Enums"]["assignment_source"]
          status?: Database["public"]["Enums"]["assignment_status"]
          template_id: string
          updated_at?: string
          window_end: string
          window_start: string
        }
        Update: {
          assignee_member_id?: string | null
          auto_confirmed?: boolean
          chore_date?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          deadline?: string
          done_at?: string | null
          duration_min?: number
          effort_points?: number
          guest_id?: string | null
          house_id?: string
          id?: string
          photo_url?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          retry_count?: number
          schedule_run_id?: string | null
          slot?: Database["public"]["Enums"]["chore_slot"]
          source?: Database["public"]["Enums"]["assignment_source"]
          status?: Database["public"]["Enums"]["assignment_status"]
          template_id?: string
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_assignments_assignee_member_id_fkey"
            columns: ["assignee_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_schedule_run_id_fkey"
            columns: ["schedule_run_id"]
            isOneToOne: false
            referencedRelation: "schedule_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "chore_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_penalties: {
        Row: {
          amount_credited_paise: number
          amount_owed_paise: number
          created_at: string
          deficit_points: number
          house_id: string
          id: string
          member_id: string
          period_id: string
          rate_paise: number
          surplus_points: number
        }
        Insert: {
          amount_credited_paise?: number
          amount_owed_paise?: number
          created_at?: string
          deficit_points?: number
          house_id: string
          id?: string
          member_id: string
          period_id: string
          rate_paise: number
          surplus_points?: number
        }
        Update: {
          amount_credited_paise?: number
          amount_owed_paise?: number
          created_at?: string
          deficit_points?: number
          house_id?: string
          id?: string
          member_id?: string
          period_id?: string
          rate_paise?: number
          surplus_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "chore_penalties_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_penalties_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_penalties_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "monthly_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_templates: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["chore_category"]
          created_at: string
          duration_min: number
          effort_points: number
          frequency: Database["public"]["Enums"]["chore_frequency"]
          house_id: string
          id: string
          is_heavy: boolean
          name: string
          requires_cooking_skill: boolean
          room_id: string | null
          scope: Database["public"]["Enums"]["chore_scope"]
          slot: Database["public"]["Enums"]["chore_slot"]
          times_per_week: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["chore_category"]
          created_at?: string
          duration_min: number
          effort_points: number
          frequency: Database["public"]["Enums"]["chore_frequency"]
          house_id: string
          id?: string
          is_heavy?: boolean
          name: string
          requires_cooking_skill?: boolean
          room_id?: string | null
          scope?: Database["public"]["Enums"]["chore_scope"]
          slot?: Database["public"]["Enums"]["chore_slot"]
          times_per_week?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["chore_category"]
          created_at?: string
          duration_min?: number
          effort_points?: number
          frequency?: Database["public"]["Enums"]["chore_frequency"]
          house_id?: string
          id?: string
          is_heavy?: boolean
          name?: string
          requires_cooking_skill?: boolean
          room_id?: string | null
          scope?: Database["public"]["Enums"]["chore_scope"]
          slot?: Database["public"]["Enums"]["chore_slot"]
          times_per_week?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_templates_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_templates_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      effort_ledger: {
        Row: {
          assigned_count: number
          base_target: number
          carry_in: number
          carry_out: number
          closed_at: string
          confirmed_count: number
          earned_points: number
          effective_target: number
          house_id: string
          id: string
          member_id: string
          missed_count: number
          present_days: number
          week_start: string
        }
        Insert: {
          assigned_count?: number
          base_target?: number
          carry_in?: number
          carry_out?: number
          closed_at?: string
          confirmed_count?: number
          earned_points?: number
          effective_target?: number
          house_id: string
          id?: string
          member_id: string
          missed_count?: number
          present_days?: number
          week_start: string
        }
        Update: {
          assigned_count?: number
          base_target?: number
          carry_in?: number
          carry_out?: number
          closed_at?: string
          confirmed_count?: number
          earned_points?: number
          effective_target?: number
          house_id?: string
          id?: string
          member_id?: string
          missed_count?: number
          present_days?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "effort_ledger_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "effort_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          created_at: string
          house_id: string
          icon: string | null
          id: string
          monthly_budget_paise: number | null
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          house_id: string
          icon?: string | null
          id?: string
          monthly_budget_paise?: number | null
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          house_id?: string
          icon?: string | null
          id?: string
          monthly_budget_paise?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          basis_note: string | null
          created_at: string
          dependent_share_paise: number
          expense_id: string
          guest_share_paise: number
          house_id: string
          id: string
          member_id: string
          share_paise: number
        }
        Insert: {
          basis_note?: string | null
          created_at?: string
          dependent_share_paise?: number
          expense_id: string
          guest_share_paise?: number
          house_id: string
          id?: string
          member_id: string
          share_paise: number
        }
        Update: {
          basis_note?: string | null
          created_at?: string
          dependent_share_paise?: number
          expense_id?: string
          guest_share_paise?: number
          house_id?: string
          id?: string
          member_id?: string
          share_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          adjustment_for_period: string | null
          amount_paise: number
          approved_at: string | null
          approved_by: string | null
          category_id: string
          created_at: string
          created_by: string
          description: string | null
          expense_date: string
          house_id: string
          id: string
          is_adjustment: boolean
          paid_by_member_id: string
          period_id: string
          receipt_url: string | null
          recurring_id: string | null
          rejection_reason: string | null
          split_basis: Database["public"]["Enums"]["split_basis"]
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
        }
        Insert: {
          adjustment_for_period?: string | null
          amount_paise: number
          approved_at?: string | null
          approved_by?: string | null
          category_id: string
          created_at?: string
          created_by: string
          description?: string | null
          expense_date: string
          house_id: string
          id?: string
          is_adjustment?: boolean
          paid_by_member_id: string
          period_id: string
          receipt_url?: string | null
          recurring_id?: string | null
          rejection_reason?: string | null
          split_basis?: Database["public"]["Enums"]["split_basis"]
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Update: {
          adjustment_for_period?: string | null
          amount_paise?: number
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          house_id?: string
          id?: string
          is_adjustment?: boolean
          paid_by_member_id?: string
          period_id?: string
          receipt_url?: string | null
          recurring_id?: string | null
          rejection_reason?: string | null
          split_basis?: Database["public"]["Enums"]["split_basis"]
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_member_id_fkey"
            columns: ["paid_by_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "monthly_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          counts_for_expense: boolean
          created_at: string
          from_date: string
          host_member_id: string
          house_id: string
          id: string
          is_assignable: boolean
          name: string
          to_date: string
        }
        Insert: {
          counts_for_expense?: boolean
          created_at?: string
          from_date: string
          host_member_id: string
          house_id: string
          id?: string
          is_assignable?: boolean
          name: string
          to_date: string
        }
        Update: {
          counts_for_expense?: boolean
          created_at?: string
          from_date?: string
          host_member_id?: string
          house_id?: string
          id?: string
          is_assignable?: boolean
          name?: string
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_host_member_id_fkey"
            columns: ["host_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      house_members: {
        Row: {
          can_cook: boolean
          created_at: string
          display_name: string | null
          does_chores: boolean
          guardian_member_id: string | null
          house_id: string
          id: string
          joined_date: string
          left_date: string | null
          member_kind: Database["public"]["Enums"]["member_kind"]
          residency: Database["public"]["Enums"]["residency_type"]
          role: Database["public"]["Enums"]["member_role"]
          shares_cost: boolean
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          can_cook?: boolean
          created_at?: string
          display_name?: string | null
          does_chores?: boolean
          guardian_member_id?: string | null
          house_id: string
          id?: string
          joined_date?: string
          left_date?: string | null
          member_kind?: Database["public"]["Enums"]["member_kind"]
          residency?: Database["public"]["Enums"]["residency_type"]
          role?: Database["public"]["Enums"]["member_role"]
          shares_cost?: boolean
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          can_cook?: boolean
          created_at?: string
          display_name?: string | null
          does_chores?: boolean
          guardian_member_id?: string | null
          house_id?: string
          id?: string
          joined_date?: string
          left_date?: string | null
          member_kind?: Database["public"]["Enums"]["member_kind"]
          residency?: Database["public"]["Enums"]["residency_type"]
          role?: Database["public"]["Enums"]["member_role"]
          shares_cost?: boolean
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_members_guardian_member_id_fkey"
            columns: ["guardian_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_members_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      house_settings: {
        Row: {
          auto_confirm_hours: number
          carry_cap_percent: number
          daily_budget_paise: number | null
          effort_mode: Database["public"]["Enums"]["effort_mode"]
          expense_approval_threshold_paise: number
          house_id: string
          llm_scheduling_enabled: boolean
          money_mode: Database["public"]["Enums"]["money_mode"]
          penalty_enabled: boolean
          penalty_rate_paise: number
          schedule_generation_dow: number
          schedule_generation_hour: number
          updated_at: string
        }
        Insert: {
          auto_confirm_hours?: number
          carry_cap_percent?: number
          daily_budget_paise?: number | null
          effort_mode?: Database["public"]["Enums"]["effort_mode"]
          expense_approval_threshold_paise?: number
          house_id: string
          llm_scheduling_enabled?: boolean
          money_mode?: Database["public"]["Enums"]["money_mode"]
          penalty_enabled?: boolean
          penalty_rate_paise?: number
          schedule_generation_dow?: number
          schedule_generation_hour?: number
          updated_at?: string
        }
        Update: {
          auto_confirm_hours?: number
          carry_cap_percent?: number
          daily_budget_paise?: number | null
          effort_mode?: Database["public"]["Enums"]["effort_mode"]
          expense_approval_threshold_paise?: number
          house_id?: string
          llm_scheduling_enabled?: boolean
          money_mode?: Database["public"]["Enums"]["money_mode"]
          penalty_enabled?: boolean
          penalty_rate_paise?: number
          schedule_generation_dow?: number
          schedule_generation_hour?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_settings_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          address: string | null
          created_at: string
          created_by: string
          currency: string
          household_type: Database["public"]["Enums"]["household_type"]
          id: string
          invite_code: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by: string
          currency?: string
          household_type?: Database["public"]["Enums"]["household_type"]
          id?: string
          invite_code: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          household_type?: Database["public"]["Enums"]["household_type"]
          id?: string
          invite_code?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "houses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      member_availability: {
        Row: {
          day_of_week: number
          house_id: string
          id: string
          is_home: boolean
          leaves_at: string | null
          member_id: string
          returns_at: string | null
          updated_at: string
        }
        Insert: {
          day_of_week: number
          house_id: string
          id?: string
          is_home?: boolean
          leaves_at?: string | null
          member_id: string
          returns_at?: string | null
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          house_id?: string
          id?: string
          is_home?: boolean
          leaves_at?: string | null
          member_id?: string
          returns_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_availability_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_availability_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_period_balances: {
        Row: {
          computed_at: string
          expense_net_paise: number
          fair_share_paise: number
          final_net_paise: number
          house_id: string
          id: string
          member_id: string
          penalty_credit_paise: number
          penalty_owed_paise: number
          period_id: string
          total_paid_paise: number
        }
        Insert: {
          computed_at?: string
          expense_net_paise?: number
          fair_share_paise?: number
          final_net_paise?: number
          house_id: string
          id?: string
          member_id: string
          penalty_credit_paise?: number
          penalty_owed_paise?: number
          period_id: string
          total_paid_paise?: number
        }
        Update: {
          computed_at?: string
          expense_net_paise?: number
          fair_share_paise?: number
          final_net_paise?: number
          house_id?: string
          id?: string
          member_id?: string
          penalty_credit_paise?: number
          penalty_owed_paise?: number
          period_id?: string
          total_paid_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_period_balances_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_period_balances_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_period_balances_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "monthly_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          house_id: string
          id: string
          locked_at: string | null
          period: string
          reopen_count: number
          status: Database["public"]["Enums"]["period_status"]
          total_expense_paise: number
          total_penalty_paise: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          house_id: string
          id?: string
          locked_at?: string | null
          period: string
          reopen_count?: number
          status?: Database["public"]["Enums"]["period_status"]
          total_expense_paise?: number
          total_penalty_paise?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          house_id?: string
          id?: string
          locked_at?: string | null
          period?: string
          reopen_count?: number
          status?: Database["public"]["Enums"]["period_status"]
          total_expense_paise?: number
          total_penalty_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_periods_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          chore_outcomes: boolean
          chore_reminders: boolean
          confirmation_requests: boolean
          expense_activity: boolean
          house_activity: boolean
          house_id: string
          member_id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          settlement_updates: boolean
          updated_at: string
          weekly_digest: boolean
        }
        Insert: {
          chore_outcomes?: boolean
          chore_reminders?: boolean
          confirmation_requests?: boolean
          expense_activity?: boolean
          house_activity?: boolean
          house_id: string
          member_id: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          settlement_updates?: boolean
          updated_at?: string
          weekly_digest?: boolean
        }
        Update: {
          chore_outcomes?: boolean
          chore_reminders?: boolean
          confirmation_requests?: boolean
          expense_activity?: boolean
          house_activity?: boolean
          house_id?: string
          member_id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          settlement_updates?: boolean
          updated_at?: string
          weekly_digest?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_prefs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_types: {
        Row: {
          body_template: string
          category: string
          deep_link_template: string
          label: string
          priority: number
          quiet_hours_exempt: boolean
          title_template: string
          type: string
        }
        Insert: {
          body_template: string
          category: string
          deep_link_template: string
          label: string
          priority: number
          quiet_hours_exempt?: boolean
          title_template: string
          type: string
        }
        Update: {
          body_template?: string
          category?: string
          deep_link_template?: string
          label?: string
          priority?: number
          quiet_hours_exempt?: boolean
          title_template?: string
          type?: string
        }
        Relationships: []
      }
      notification_variants: {
        Row: {
          body_template: string
          type: string
          variant: string
        }
        Insert: {
          body_template: string
          type: string
          variant: string
        }
        Update: {
          body_template?: string
          type?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_variants_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["type"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notify_channel"]
          coalesced_into: string | null
          created_at: string
          deep_link: string | null
          house_id: string
          id: string
          member_id: string
          payload: Json
          priority: number
          push_sent_at: string | null
          read_at: string | null
          scheduled_for: string
          sent_at: string | null
          tag: string | null
          title: string
          type: string
        }
        Insert: {
          body: string
          channel?: Database["public"]["Enums"]["notify_channel"]
          coalesced_into?: string | null
          created_at?: string
          deep_link?: string | null
          house_id: string
          id?: string
          member_id: string
          payload?: Json
          priority?: number
          push_sent_at?: string | null
          read_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          tag?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notify_channel"]
          coalesced_into?: string | null
          created_at?: string
          deep_link?: string | null
          house_id?: string
          id?: string
          member_id?: string
          payload?: Json
          priority?: number
          push_sent_at?: string | null
          read_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          tag?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_coalesced_into_fkey"
            columns: ["coalesced_into"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failed_at: string | null
          house_id: string
          id: string
          last_seen_at: string
          member_id: string
          p256dh: string
          platform: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failed_at?: string | null
          house_id: string
          id?: string
          last_seen_at?: string
          member_id: string
          p256dh: string
          platform?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failed_at?: string | null
          house_id?: string
          id?: string
          last_seen_at?: string
          member_id?: string
          p256dh?: string
          platform?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount_paise: number
          auto_approve: boolean
          category_id: string
          created_at: string
          day_of_month: number
          house_id: string
          id: string
          name: string
          next_run_date: string
          paid_by_member_id: string | null
          split_basis: Database["public"]["Enums"]["split_basis"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_paise: number
          auto_approve?: boolean
          category_id: string
          created_at?: string
          day_of_month: number
          house_id: string
          id?: string
          name: string
          next_run_date: string
          paid_by_member_id?: string | null
          split_basis?: Database["public"]["Enums"]["split_basis"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_paise?: number
          auto_approve?: boolean
          category_id?: string
          created_at?: string
          day_of_month?: number
          house_id?: string
          id?: string
          name?: string
          next_run_date?: string
          paid_by_member_id?: string | null
          split_basis?: Database["public"]["Enums"]["split_basis"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_paid_by_member_id_fkey"
            columns: ["paid_by_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      room_assignments: {
        Row: {
          created_at: string
          from_date: string
          house_id: string
          id: string
          member_id: string
          room_id: string
          to_date: string | null
        }
        Insert: {
          created_at?: string
          from_date: string
          house_id: string
          id?: string
          member_id: string
          room_id: string
          to_date?: string | null
        }
        Update: {
          created_at?: string
          from_date?: string
          house_id?: string
          id?: string
          member_id?: string
          room_id?: string
          to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_assignments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          created_at: string
          deleted_at: string | null
          house_id: string
          id: string
          monthly_rent_paise: number
          name: string
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          deleted_at?: string | null
          house_id: string
          id?: string
          monthly_rent_paise?: number
          name: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          deleted_at?: string | null
          house_id?: string
          id?: string
          monthly_rent_paise?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_runs: {
        Row: {
          created_at: string
          generated_at: string
          generator: Database["public"]["Enums"]["assignment_source"]
          house_id: string
          id: string
          llm_accepted: boolean | null
          llm_rationale: string | null
          max_deviation: number
          total_points: number
          unassigned_count: number
          week_start: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generator: Database["public"]["Enums"]["assignment_source"]
          house_id: string
          id?: string
          llm_accepted?: boolean | null
          llm_rationale?: string | null
          max_deviation?: number
          total_points?: number
          unassigned_count?: number
          week_start: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          generator?: Database["public"]["Enums"]["assignment_source"]
          house_id?: string
          id?: string
          llm_accepted?: boolean | null
          llm_rationale?: string | null
          max_deviation?: number
          total_points?: number
          unassigned_count?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_runs_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_paise: number
          confirmed_at: string | null
          created_at: string
          from_member_id: string
          house_id: string
          id: string
          is_delta: boolean
          marked_paid_at: string | null
          note: string | null
          period_id: string
          status: Database["public"]["Enums"]["settlement_status"]
          to_member_id: string
          updated_at: string
          upi_link: string | null
        }
        Insert: {
          amount_paise: number
          confirmed_at?: string | null
          created_at?: string
          from_member_id: string
          house_id: string
          id?: string
          is_delta?: boolean
          marked_paid_at?: string | null
          note?: string | null
          period_id: string
          status?: Database["public"]["Enums"]["settlement_status"]
          to_member_id: string
          updated_at?: string
          upi_link?: string | null
        }
        Update: {
          amount_paise?: number
          confirmed_at?: string | null
          created_at?: string
          from_member_id?: string
          house_id?: string
          id?: string
          is_delta?: boolean
          marked_paid_at?: string | null
          note?: string | null
          period_id?: string
          status?: Database["public"]["Enums"]["settlement_status"]
          to_member_id?: string
          updated_at?: string
          upi_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_from_member_id_fkey"
            columns: ["from_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "monthly_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_member_id_fkey"
            columns: ["to_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_requests: {
        Row: {
          assignment_id: string
          created_at: string
          from_member_id: string
          house_id: string
          id: string
          message: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["swap_status"]
          to_member_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          from_member_id: string
          house_id: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["swap_status"]
          to_member_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          from_member_id?: string
          house_id?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["swap_status"]
          to_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_requests_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "chore_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_from_member_id_fkey"
            columns: ["from_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_to_member_id_fkey"
            columns: ["to_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          phone: string | null
          updated_at: string
          upi_vpa: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          phone?: string | null
          updated_at?: string
          upi_vpa?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          phone?: string | null
          updated_at?: string
          upi_vpa?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_current_occupancy: {
        Row: {
          capacity: number | null
          display_name: string | null
          house_id: string | null
          member_id: string | null
          monthly_rent_paise: number | null
          room_id: string | null
          room_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_assignments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      v_effort_standing: {
        Row: {
          chores_done: number | null
          chores_missed: number | null
          display_name: string | null
          house_id: string | null
          member_id: string | null
          running_carry: number | null
          total_earned: number | null
          total_target: number | null
        }
        Relationships: [
          {
            foreignKeyName: "effort_ledger_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "effort_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_dependent: {
        Args: {
          p_does_chores?: boolean
          p_guardian_id?: string
          p_house_id: string
          p_name: string
          p_residency?: Database["public"]["Enums"]["residency_type"]
          p_shares_cost?: boolean
        }
        Returns: {
          can_cook: boolean
          created_at: string
          display_name: string | null
          does_chores: boolean
          guardian_member_id: string | null
          house_id: string
          id: string
          joined_date: string
          left_date: string | null
          member_kind: Database["public"]["Enums"]["member_kind"]
          residency: Database["public"]["Enums"]["residency_type"]
          role: Database["public"]["Enums"]["member_role"]
          shares_cost: boolean
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "house_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      app_config_value: { Args: { p_key: string }; Returns: string }
      approve_expense: {
        Args: { p_approve: boolean; p_expense_id: string; p_reason?: string }
        Returns: Database["public"]["Enums"]["expense_status"]
      }
      assign_room: {
        Args: { p_from_date?: string; p_member_id: string; p_room_id: string }
        Returns: string
      }
      call_edge: { Args: { body?: Json; fn: string }; Returns: undefined }
      carry_forward_expense: {
        Args: {
          p_amount_paise: number
          p_category_id: string
          p_description?: string
          p_expense_date: string
          p_paid_by_member_id?: string
          p_receipt_url?: string
          p_split_basis: Database["public"]["Enums"]["split_basis"]
          p_splits: Json
        }
        Returns: string
      }
      check_budget_thresholds: { Args: never; Returns: number }
      claim_chore: {
        Args: { p_assignment_id: string }
        Returns: Database["public"]["Enums"]["assignment_status"]
      }
      claim_username: { Args: { p_username: string }; Returns: string }
      close_period: {
        Args: {
          p_balances: Json
          p_penalties?: Json
          p_period_id: string
          p_settlements: Json
        }
        Returns: Database["public"]["Enums"]["period_status"]
      }
      confirm_chore: {
        Args: { p_assignment_id: string }
        Returns: Database["public"]["Enums"]["assignment_status"]
      }
      confirm_settlement: {
        Args: { p_settlement_id: string }
        Returns: {
          period_locked: boolean
          settlement_status_now: Database["public"]["Enums"]["settlement_status"]
        }[]
      }
      create_expense: {
        Args: {
          p_adjustment_for_period?: string
          p_amount_paise: number
          p_category_id: string
          p_description?: string
          p_expense_date: string
          p_is_adjustment?: boolean
          p_paid_by_member_id?: string
          p_period?: string
          p_receipt_url?: string
          p_recurring_id?: string
          p_split_basis: Database["public"]["Enums"]["split_basis"]
          p_splits: Json
        }
        Returns: string
      }
      create_house: {
        Args: {
          p_address?: string
          p_currency?: string
          p_name: string
          p_timezone?: string
          p_type?: Database["public"]["Enums"]["household_type"]
        }
        Returns: {
          house_id: string
          invite_code: string
        }[]
      }
      current_member: {
        Args: { p_house_id?: string }
        Returns: {
          can_cook: boolean
          created_at: string
          display_name: string | null
          does_chores: boolean
          guardian_member_id: string | null
          house_id: string
          id: string
          joined_date: string
          left_date: string | null
          member_kind: Database["public"]["Enums"]["member_kind"]
          residency: Database["public"]["Enums"]["residency_type"]
          role: Database["public"]["Enums"]["member_role"]
          shares_cost: boolean
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "house_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      delete_room: { Args: { p_room_id: string }; Returns: undefined }
      enqueue_house_notification: {
        Args: {
          p_admins_only?: boolean
          p_exclude?: string
          p_house_id: string
          p_payload?: Json
          p_scheduled_for?: string
          p_tag?: string
          p_type: string
          p_vars?: Json
        }
        Returns: number
      }
      enqueue_notification: {
        Args: {
          p_house_id: string
          p_member_id: string
          p_payload?: Json
          p_scheduled_for?: string
          p_tag?: string
          p_type: string
          p_variant?: string
          p_vars?: Json
        }
        Returns: string
      }
      ensure_period: {
        Args: { p_house_id: string; p_period: string }
        Returns: string
      }
      escalate_missed_chores: { Args: never; Returns: number }
      generate_invite_code: { Args: never; Returns: string }
      has_membership: { Args: { p_house_id: string }; Returns: boolean }
      is_house_admin: { Args: { p_house_id: string }; Returns: boolean }
      is_house_member: { Args: { p_house_id: string }; Returns: boolean }
      join_house: {
        Args: { p_invite_code: string }
        Returns: {
          house_id: string
          house_name: string
          status: Database["public"]["Enums"]["member_status"]
        }[]
      }
      mark_all_notifications_read: {
        Args: { p_house_id: string }
        Returns: number
      }
      mark_chore_done: {
        Args: { p_assignment_id: string; p_photo_url?: string }
        Returns: Database["public"]["Enums"]["assignment_status"]
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      mark_settlement_paid: {
        Args: { p_paid: boolean; p_settlement_id: string }
        Returns: Database["public"]["Enums"]["settlement_status"]
      }
      member_display_name: { Args: { p_member_id: string }; Returns: string }
      notify_schedule_published: { Args: { p_run_id: string }; Returns: number }
      period_close_readiness: {
        Args: { p_period_id: string }
        Returns: {
          month_ended: boolean
          pending_approvals: number
          period_status_now: Database["public"]["Enums"]["period_status"]
        }[]
      }
      prune_notifications: { Args: never; Returns: number }
      publish_schedule: {
        Args: {
          p_assignments: Json
          p_generator?: Database["public"]["Enums"]["assignment_source"]
          p_llm_accepted?: boolean
          p_llm_rationale?: string
          p_max_deviation?: number
          p_week_start: string
        }
        Returns: string
      }
      publish_schedule_for_house: {
        Args: {
          p_assignments: Json
          p_generator?: Database["public"]["Enums"]["assignment_source"]
          p_house_id: string
          p_llm_accepted?: boolean
          p_llm_rationale?: string
          p_max_deviation?: number
          p_week_start: string
        }
        Returns: string
      }
      regenerate_invite_code: { Args: { p_house_id: string }; Returns: string }
      reject_chore: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: Database["public"]["Enums"]["assignment_status"]
      }
      release_chore: {
        Args: { p_assignment_id: string }
        Returns: Database["public"]["Enums"]["assignment_status"]
      }
      remind_outstanding_settlements: { Args: never; Returns: number }
      render_template: {
        Args: { p_template: string; p_vars: Json }
        Returns: string
      }
      reopen_period: {
        Args: { p_period_id: string; p_reason: string }
        Returns: Database["public"]["Enums"]["period_status"]
      }
      replace_expense_splits: {
        Args: { p_expense_id: string; p_splits: Json }
        Returns: undefined
      }
      request_swap: {
        Args: {
          p_assignment_id: string
          p_message?: string
          p_to_member_id: string
        }
        Returns: string
      }
      respond_to_swap: {
        Args: { p_accept: boolean; p_swap_id: string }
        Returns: Database["public"]["Enums"]["swap_status"]
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_platform?: string
          p_user_agent?: string
        }
        Returns: string
      }
      seed_default_categories: {
        Args: {
          p_house_id: string
          p_type?: Database["public"]["Enums"]["household_type"]
        }
        Returns: undefined
      }
      seed_default_chore_templates: {
        Args: { p_house_id: string }
        Returns: undefined
      }
      set_notification_prefs: {
        Args: {
          p_chore_outcomes?: boolean
          p_chore_reminders?: boolean
          p_confirmation_requests?: boolean
          p_expense_activity?: boolean
          p_house_activity?: boolean
          p_quiet_hours_end?: string
          p_quiet_hours_off?: boolean
          p_quiet_hours_start?: string
          p_weekly_digest?: boolean
        }
        Returns: {
          chore_outcomes: boolean
          chore_reminders: boolean
          confirmation_requests: boolean
          expense_activity: boolean
          house_activity: boolean
          house_id: string
          member_id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          settlement_updates: boolean
          updated_at: string
          weekly_digest: boolean
        }
        SetofOptions: {
          from: "*"
          to: "notification_prefs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shares_active_house_with: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      snooze_notification: {
        Args: { p_notification_id: string }
        Returns: string
      }
      username_available: { Args: { p_username: string }; Returns: boolean }
      void_expense: {
        Args: { p_expense_id: string; p_reason: string }
        Returns: undefined
      }
      warn_deficits: { Args: { p_threshold?: number }; Returns: number }
      week_start_of: { Args: { p_date: string }; Returns: string }
    }
    Enums: {
      assignment_source: "engine" | "llm" | "admin" | "marketplace" | "swap"
      assignment_status:
        | "assigned"
        | "open"
        | "done_pending"
        | "confirmed"
        | "rejected"
        | "missed"
        | "cancelled"
      chore_category:
        | "room_cleaning"
        | "cooking"
        | "kitchen_cleaning"
        | "bathroom_cleaning"
        | "common_cleaning"
        | "mopping"
        | "other"
      chore_frequency: "daily" | "weekly" | "times_per_week"
      chore_scope: "house" | "room"
      chore_slot: "morning" | "evening" | "any"
      effort_mode: "points" | "rota"
      exception_type: "away" | "home_all_day" | "custom_hours"
      expense_status: "pending_approval" | "approved" | "rejected" | "void"
      household_type: "shared" | "family"
      llm_purpose: "schedule" | "digest" | "nl_parse"
      member_kind: "adult" | "dependent"
      member_role: "admin" | "member"
      member_status: "pending" | "active" | "inactive"
      money_mode: "split" | "pot"
      notify_channel: "push" | "in_app"
      period_status: "open" | "closing" | "closed" | "reopened"
      residency_type: "full_time" | "weekday_only" | "weekend_only"
      settlement_status: "pending" | "marked_paid" | "confirmed"
      split_basis: "equal" | "room_rent" | "custom" | "payer"
      swap_status: "pending" | "accepted" | "declined" | "expired"
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
    Enums: {
      assignment_source: ["engine", "llm", "admin", "marketplace", "swap"],
      assignment_status: [
        "assigned",
        "open",
        "done_pending",
        "confirmed",
        "rejected",
        "missed",
        "cancelled",
      ],
      chore_category: [
        "room_cleaning",
        "cooking",
        "kitchen_cleaning",
        "bathroom_cleaning",
        "common_cleaning",
        "mopping",
        "other",
      ],
      chore_frequency: ["daily", "weekly", "times_per_week"],
      chore_scope: ["house", "room"],
      chore_slot: ["morning", "evening", "any"],
      effort_mode: ["points", "rota"],
      exception_type: ["away", "home_all_day", "custom_hours"],
      expense_status: ["pending_approval", "approved", "rejected", "void"],
      household_type: ["shared", "family"],
      llm_purpose: ["schedule", "digest", "nl_parse"],
      member_kind: ["adult", "dependent"],
      member_role: ["admin", "member"],
      member_status: ["pending", "active", "inactive"],
      money_mode: ["split", "pot"],
      notify_channel: ["push", "in_app"],
      period_status: ["open", "closing", "closed", "reopened"],
      residency_type: ["full_time", "weekday_only", "weekend_only"],
      settlement_status: ["pending", "marked_paid", "confirmed"],
      split_basis: ["equal", "room_rent", "custom", "payer"],
      swap_status: ["pending", "accepted", "declined", "expired"],
    },
  },
} as const
