export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      absence_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          from_date: string
          house_id: string
          id: string
          member_id: string
          reason: string | null
          status: Database["public"]["Enums"]["absence_status"]
          to_date: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          from_date: string
          house_id: string
          id?: string
          member_id: string
          reason?: string | null
          status?: Database["public"]["Enums"]["absence_status"]
          to_date: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          from_date?: string
          house_id?: string
          id?: string
          member_id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["absence_status"]
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_requests_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
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
      balance_adjustments: {
        Row: {
          amount_paise: number
          created_at: string
          decision_id: string
          from_member_id: string
          house_id: string
          id: string
          period_id: string
          reason: string | null
          to_member_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          decision_id: string
          from_member_id: string
          house_id: string
          id?: string
          period_id: string
          reason?: string | null
          to_member_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          decision_id?: string
          from_member_id?: string
          house_id?: string
          id?: string
          period_id?: string
          reason?: string | null
          to_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_adjustments_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: true
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_from_member_id_fkey"
            columns: ["from_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "monthly_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_to_member_id_fkey"
            columns: ["to_member_id"]
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
          confirmations_received: number
          confirmations_required: number
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
          note: string | null
          photo_url: string | null
          rejected_by: string | null
          rejected_reason: string | null
          requires_lead_confirmer: boolean
          retry_count: number
          schedule_run_id: string | null
          shared_with: string[]
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
          confirmations_received?: number
          confirmations_required?: number
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
          note?: string | null
          photo_url?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          requires_lead_confirmer?: boolean
          retry_count?: number
          schedule_run_id?: string | null
          shared_with?: string[]
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
          confirmations_received?: number
          confirmations_required?: number
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
          note?: string | null
          photo_url?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          requires_lead_confirmer?: boolean
          retry_count?: number
          schedule_run_id?: string | null
          shared_with?: string[]
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
          {
            foreignKeyName: "chore_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "v_template_last_done"
            referencedColumns: ["template_id"]
          },
        ]
      }
      chore_confirmations: {
        Row: {
          assignment_id: string
          created_at: string
          house_id: string
          id: string
          is_lead: boolean
          member_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          house_id: string
          id?: string
          is_lead?: boolean
          member_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          house_id?: string
          id?: string
          is_lead?: boolean
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_confirmations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "chore_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_confirmations_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_confirmations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
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
      decision_participants: {
        Row: {
          capacity: Database["public"]["Enums"]["response_capacity"]
          created_at: string
          decision_id: string
          id: string
          is_mandatory: boolean
          member_id: string
        }
        Insert: {
          capacity: Database["public"]["Enums"]["response_capacity"]
          created_at?: string
          decision_id: string
          id?: string
          is_mandatory?: boolean
          member_id: string
        }
        Update: {
          capacity?: Database["public"]["Enums"]["response_capacity"]
          created_at?: string
          decision_id?: string
          id?: string
          is_mandatory?: boolean
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_participants_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_responses: {
        Row: {
          capacity: Database["public"]["Enums"]["response_capacity"]
          decision_id: string
          id: string
          member_id: string
          reason: string | null
          responded_at: string
          response: Database["public"]["Enums"]["response_kind"]
        }
        Insert: {
          capacity: Database["public"]["Enums"]["response_capacity"]
          decision_id: string
          id?: string
          member_id: string
          reason?: string | null
          responded_at?: string
          response: Database["public"]["Enums"]["response_kind"]
        }
        Update: {
          capacity?: Database["public"]["Enums"]["response_capacity"]
          decision_id?: string
          id?: string
          member_id?: string
          reason?: string | null
          responded_at?: string
          response?: Database["public"]["Enums"]["response_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "decision_responses_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          applied_at: string | null
          auto_approved: boolean
          created_at: string
          deadline: string | null
          house_id: string
          id: string
          level: Database["public"]["Enums"]["decision_level"]
          payload: Json
          reason: string | null
          requested_by: string
          required_acks: number
          required_approvals: number
          resolved_at: string | null
          result: Json | null
          status: Database["public"]["Enums"]["decision_status"]
          subject_id: string | null
          subject_member_id: string | null
          subject_type: string | null
          supersedes_id: string | null
          type: Database["public"]["Enums"]["decision_type"]
        }
        Insert: {
          applied_at?: string | null
          auto_approved?: boolean
          created_at?: string
          deadline?: string | null
          house_id: string
          id?: string
          level: Database["public"]["Enums"]["decision_level"]
          payload?: Json
          reason?: string | null
          requested_by: string
          required_acks?: number
          required_approvals?: number
          resolved_at?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["decision_status"]
          subject_id?: string | null
          subject_member_id?: string | null
          subject_type?: string | null
          supersedes_id?: string | null
          type: Database["public"]["Enums"]["decision_type"]
        }
        Update: {
          applied_at?: string | null
          auto_approved?: boolean
          created_at?: string
          deadline?: string | null
          house_id?: string
          id?: string
          level?: Database["public"]["Enums"]["decision_level"]
          payload?: Json
          reason?: string | null
          requested_by?: string
          required_acks?: number
          required_approvals?: number
          resolved_at?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["decision_status"]
          subject_id?: string | null
          subject_member_id?: string | null
          subject_type?: string | null
          supersedes_id?: string | null
          type?: Database["public"]["Enums"]["decision_type"]
        }
        Relationships: [
          {
            foreignKeyName: "decisions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_subject_member_id_fkey"
            columns: ["subject_member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "decisions"
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
          meal_id: string | null
          paid_by_member_id: string
          period_id: string
          receipt_url: string | null
          recurring_id: string | null
          rejection_reason: string | null
          reserve_id: string | null
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
          meal_id?: string | null
          paid_by_member_id: string
          period_id: string
          receipt_url?: string | null
          recurring_id?: string | null
          rejection_reason?: string | null
          reserve_id?: string | null
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
          meal_id?: string | null
          paid_by_member_id?: string
          period_id?: string
          receipt_url?: string | null
          recurring_id?: string | null
          rejection_reason?: string | null
          reserve_id?: string | null
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
          {
            foreignKeyName: "expenses_reserve_id_fkey"
            columns: ["reserve_id"]
            isOneToOne: false
            referencedRelation: "reserves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expense_meal"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      food_preferences: {
        Row: {
          created_at: string
          food_id: string | null
          house_id: string
          id: string
          item_name: string | null
          member_id: string
          rating: Database["public"]["Enums"]["food_rating"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          food_id?: string | null
          house_id: string
          id?: string
          item_name?: string | null
          member_id: string
          rating: Database["public"]["Enums"]["food_rating"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          food_id?: string | null
          house_id?: string
          id?: string
          item_name?: string | null
          member_id?: string
          rating?: Database["public"]["Enums"]["food_rating"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_preferences_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_preferences_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          default_items: string[]
          default_source: Database["public"]["Enums"]["meal_source"] | null
          home_preference: number | null
          house_id: string
          id: string
          last_eaten_on: string | null
          meal_types: Database["public"]["Enums"]["meal_type"][]
          merged_into_id: string | null
          name: string
          normalised_name: string
          recipe_instructions: string | null
          region_tag: string | null
          times_eaten: number
          typical_cost_paise: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          default_items?: string[]
          default_source?: Database["public"]["Enums"]["meal_source"] | null
          home_preference?: number | null
          house_id: string
          id?: string
          last_eaten_on?: string | null
          meal_types?: Database["public"]["Enums"]["meal_type"][]
          merged_into_id?: string | null
          name: string
          normalised_name: string
          recipe_instructions?: string | null
          region_tag?: string | null
          times_eaten?: number
          typical_cost_paise?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          default_items?: string[]
          default_source?: Database["public"]["Enums"]["meal_source"] | null
          home_preference?: number | null
          house_id?: string
          id?: string
          last_eaten_on?: string | null
          meal_types?: Database["public"]["Enums"]["meal_type"][]
          merged_into_id?: string | null
          name?: string
          normalised_name?: string
          recipe_instructions?: string | null
          region_tag?: string | null
          times_eaten?: number
          typical_cost_paise?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "foods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_policy: {
        Row: {
          absence_approver_roles: Database["public"]["Enums"]["member_role"][]
          absence_deadline_hours: number
          created_at: string
          critical_member_rule: string
          critical_member_value: number
          critical_requires_coadmin: boolean
          decision_deadline_days: number
          expense_approvals_required: number
          governance_requires_all: boolean
          house_id: string
          join_approver_roles: Database["public"]["Enums"]["member_role"][]
          updated_at: string
        }
        Insert: {
          absence_approver_roles?: Database["public"]["Enums"]["member_role"][]
          absence_deadline_hours?: number
          created_at?: string
          critical_member_rule?: string
          critical_member_value?: number
          critical_requires_coadmin?: boolean
          decision_deadline_days?: number
          expense_approvals_required?: number
          governance_requires_all?: boolean
          house_id: string
          join_approver_roles?: Database["public"]["Enums"]["member_role"][]
          updated_at?: string
        }
        Update: {
          absence_approver_roles?: Database["public"]["Enums"]["member_role"][]
          absence_deadline_hours?: number
          created_at?: string
          critical_member_rule?: string
          critical_member_value?: number
          critical_requires_coadmin?: boolean
          decision_deadline_days?: number
          expense_approvals_required?: number
          governance_requires_all?: boolean
          house_id?: string
          join_approver_roles?: Database["public"]["Enums"]["member_role"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_policy_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "houses"
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
      home_rule_versions: {
        Row: {
          action: Json
          activated_at: string | null
          applies_to: Json
          change_reason: string | null
          condition: Json
          created_at: string
          created_by: string
          decision_id: string | null
          ends_on: string | null
          house_id: string
          id: string
          original_text: string
          parsed_by: Database["public"]["Enums"]["rule_parse_source"]
          penalty_paise: number | null
          rule_id: string
          starts_on: string | null
          superseded_at: string | null
          title: string
          version_no: number
          weight_points: number | null
        }
        Insert: {
          action?: Json
          activated_at?: string | null
          applies_to?: Json
          change_reason?: string | null
          condition?: Json
          created_at?: string
          created_by: string
          decision_id?: string | null
          ends_on?: string | null
          house_id: string
          id?: string
          original_text: string
          parsed_by?: Database["public"]["Enums"]["rule_parse_source"]
          penalty_paise?: number | null
          rule_id: string
          starts_on?: string | null
          superseded_at?: string | null
          title: string
          version_no: number
          weight_points?: number | null
        }
        Update: {
          action?: Json
          activated_at?: string | null
          applies_to?: Json
          change_reason?: string | null
          condition?: Json
          created_at?: string
          created_by?: string
          decision_id?: string | null
          ends_on?: string | null
          house_id?: string
          id?: string
          original_text?: string
          parsed_by?: Database["public"]["Enums"]["rule_parse_source"]
          penalty_paise?: number | null
          rule_id?: string
          starts_on?: string | null
          superseded_at?: string | null
          title?: string
          version_no?: number
          weight_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "home_rule_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_rule_versions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_rule_versions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_rule_versions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "home_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      home_rules: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          house_id: string
          id: string
          sort_order: number
          status: Database["public"]["Enums"]["rule_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version_id?: string | null
          house_id: string
          id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["rule_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          house_id?: string
          id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["rule_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "home_rule_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_rules_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      house_llm_credentials: {
        Row: {
          base_url: string | null
          capabilities: Json
          created_at: string
          created_by: string
          house_id: string
          key_ciphertext: string
          key_iv: string
          key_last4: string
          key_tag: string
          key_version: number
          last_error: string | null
          last_verified_at: string | null
          model: string
          provider: string
          status: Database["public"]["Enums"]["llm_credential_status"]
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          capabilities?: Json
          created_at?: string
          created_by: string
          house_id: string
          key_ciphertext: string
          key_iv: string
          key_last4: string
          key_tag: string
          key_version?: number
          last_error?: string | null
          last_verified_at?: string | null
          model: string
          provider: string
          status?: Database["public"]["Enums"]["llm_credential_status"]
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          capabilities?: Json
          created_at?: string
          created_by?: string
          house_id?: string
          key_ciphertext?: string
          key_iv?: string
          key_last4?: string
          key_tag?: string
          key_version?: number
          last_error?: string | null
          last_verified_at?: string | null
          model?: string
          provider?: string
          status?: Database["public"]["Enums"]["llm_credential_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_llm_credentials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_llm_credentials_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
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
          pending_settlement: boolean
          removal_decision_id: string | null
          residency: Database["public"]["Enums"]["residency_type"]
          role: Database["public"]["Enums"]["member_role"] | null
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
          pending_settlement?: boolean
          removal_decision_id?: string | null
          residency?: Database["public"]["Enums"]["residency_type"]
          role?: Database["public"]["Enums"]["member_role"] | null
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
          pending_settlement?: boolean
          removal_decision_id?: string | null
          residency?: Database["public"]["Enums"]["residency_type"]
          role?: Database["public"]["Enums"]["member_role"] | null
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
            foreignKeyName: "house_members_removal_decision_fkey"
            columns: ["removal_decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
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
          confirmation_policy: Database["public"]["Enums"]["confirmation_policy"]
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
          confirmation_policy?: Database["public"]["Enums"]["confirmation_policy"]
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
          confirmation_policy?: Database["public"]["Enums"]["confirmation_policy"]
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
          area: string | null
          city: string | null
          country_code: string | null
          created_at: string
          created_by: string
          currency: string
          home_type: Database["public"]["Enums"]["home_type"]
          id: string
          invite_code: string
          name: string
          state: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          area?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by: string
          currency?: string
          home_type?: Database["public"]["Enums"]["home_type"]
          id?: string
          invite_code: string
          name: string
          state?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          area?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          home_type?: Database["public"]["Enums"]["home_type"]
          id?: string
          invite_code?: string
          name?: string
          state?: string | null
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
      invitations: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          house_id: string
          id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          house_id: string
          id?: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          house_id?: string
          id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decline_reason: string | null
          house_id: string
          id: string
          invitation_id: string | null
          member_id: string | null
          message: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decline_reason?: string | null
          house_id: string
          id?: string
          invitation_id?: string | null
          member_id?: string | null
          message?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decline_reason?: string | null
          house_id?: string
          id?: string
          invitation_id?: string | null
          member_id?: string | null
          message?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_runs: {
        Row: {
          accepted: boolean
          completion_tokens: number | null
          created_at: string
          error: string | null
          house_id: string
          id: string
          input_payload: Json
          latency_ms: number | null
          model: string
          output_payload: Json | null
          prompt_tokens: number | null
          provider: string
          purpose: Database["public"]["Enums"]["llm_purpose"]
          validation_errors: Json | null
        }
        Insert: {
          accepted?: boolean
          completion_tokens?: number | null
          created_at?: string
          error?: string | null
          house_id: string
          id?: string
          input_payload: Json
          latency_ms?: number | null
          model: string
          output_payload?: Json | null
          prompt_tokens?: number | null
          provider: string
          purpose: Database["public"]["Enums"]["llm_purpose"]
          validation_errors?: Json | null
        }
        Update: {
          accepted?: boolean
          completion_tokens?: number | null
          created_at?: string
          error?: string | null
          house_id?: string
          id?: string
          input_payload?: Json
          latency_ms?: number | null
          model?: string
          output_payload?: Json | null
          prompt_tokens?: number | null
          provider?: string
          purpose?: Database["public"]["Enums"]["llm_purpose"]
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_runs_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_items: {
        Row: {
          cost_paise: number | null
          food_id: string | null
          house_id: string
          id: string
          meal_id: string
          name: string
          quantity: string | null
          sort_order: number
        }
        Insert: {
          cost_paise?: number | null
          food_id?: string | null
          house_id: string
          id?: string
          meal_id: string
          name: string
          quantity?: string | null
          sort_order?: number
        }
        Update: {
          cost_paise?: number | null
          food_id?: string | null
          house_id?: string
          id?: string
          meal_id?: string
          name?: string
          quantity?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_participants: {
        Row: {
          guest_id: string | null
          house_id: string
          id: string
          label: string | null
          meal_id: string
          member_id: string | null
          share_paise: number
        }
        Insert: {
          guest_id?: string | null
          house_id: string
          id?: string
          label?: string | null
          meal_id: string
          member_id?: string | null
          share_paise?: number
        }
        Update: {
          guest_id?: string | null
          house_id?: string
          id?: string
          label?: string | null
          meal_id?: string
          member_id?: string | null
          share_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_participants_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_participants_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_participants_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          confirmed_meal_id: string | null
          created_at: string
          created_by: string
          food_id: string | null
          house_id: string
          id: string
          name: string
          planned_date: string
        }
        Insert: {
          confirmed_meal_id?: string | null
          created_at?: string
          created_by: string
          food_id?: string | null
          house_id: string
          id?: string
          name: string
          planned_date: string
        }
        Update: {
          confirmed_meal_id?: string | null
          created_at?: string
          created_by?: string
          food_id?: string | null
          house_id?: string
          id?: string
          name?: string
          planned_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_confirmed_meal_id_fkey"
            columns: ["confirmed_meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          base_cost_paise: number
          created_at: string
          created_by: string
          delivery_cost_paise: number
          expense_id: string | null
          food_id: string | null
          house_id: string
          id: string
          meal_date: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          name: string
          note: string | null
          other_cost_paise: number
          photo_url: string | null
          prep_cost_paise: number
          recipe_instructions: string | null
          source: Database["public"]["Enums"]["meal_source"]
          total_cost_paise: number
          updated_at: string
        }
        Insert: {
          base_cost_paise?: number
          created_at?: string
          created_by: string
          delivery_cost_paise?: number
          expense_id?: string | null
          food_id?: string | null
          house_id: string
          id?: string
          meal_date: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          name: string
          note?: string | null
          other_cost_paise?: number
          photo_url?: string | null
          prep_cost_paise?: number
          recipe_instructions?: string | null
          source?: Database["public"]["Enums"]["meal_source"]
          total_cost_paise?: number
          updated_at?: string
        }
        Update: {
          base_cost_paise?: number
          created_at?: string
          created_by?: string
          delivery_cost_paise?: number
          expense_id?: string | null
          food_id?: string | null
          house_id?: string
          id?: string
          meal_date?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          name?: string
          note?: string | null
          other_cost_paise?: number
          photo_url?: string | null
          prep_cost_paise?: number
          recipe_instructions?: string | null
          source?: Database["public"]["Enums"]["meal_source"]
          total_cost_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
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
      member_expected_contributions: {
        Row: {
          amount_paise: number
          created_at: string
          decision_id: string
          effective_from: string
          effective_to: string | null
          house_id: string
          id: string
          member_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          decision_id: string
          effective_from: string
          effective_to?: string | null
          house_id: string
          id?: string
          member_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          decision_id?: string
          effective_from?: string
          effective_to?: string | null
          house_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_expected_contributions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_expected_contributions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_expected_contributions_member_id_fkey"
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
      member_restrictions: {
        Row: {
          canonical_item: string | null
          created_at: string
          house_id: string
          id: string
          item_name: string
          member_id: string
          note: string | null
          severity: Database["public"]["Enums"]["restriction_severity"]
          updated_at: string
        }
        Insert: {
          canonical_item?: string | null
          created_at?: string
          house_id: string
          id?: string
          item_name: string
          member_id: string
          note?: string | null
          severity: Database["public"]["Enums"]["restriction_severity"]
          updated_at?: string
        }
        Update: {
          canonical_item?: string | null
          created_at?: string
          house_id?: string
          id?: string
          item_name?: string
          member_id?: string
          note?: string | null
          severity?: Database["public"]["Enums"]["restriction_severity"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_restrictions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_restrictions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
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
          decision_outcomes: boolean
          decisions: boolean
          expense_activity: boolean
          house_activity: boolean
          house_id: string
          member_id: string
          membership: boolean
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
          decision_outcomes?: boolean
          decisions?: boolean
          expense_activity?: boolean
          house_activity?: boolean
          house_id: string
          member_id: string
          membership?: boolean
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
          decision_outcomes?: boolean
          decisions?: boolean
          expense_activity?: boolean
          house_activity?: boolean
          house_id?: string
          member_id?: string
          membership?: boolean
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
          member_id: string | null
          payload: Json
          priority: number
          push_sent_at: string | null
          read_at: string | null
          scheduled_for: string
          sent_at: string | null
          tag: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body: string
          channel?: Database["public"]["Enums"]["notify_channel"]
          coalesced_into?: string | null
          created_at?: string
          deep_link?: string | null
          house_id: string
          id?: string
          member_id?: string | null
          payload?: Json
          priority?: number
          push_sent_at?: string | null
          read_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          tag?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notify_channel"]
          coalesced_into?: string | null
          created_at?: string
          deep_link?: string | null
          house_id?: string
          id?: string
          member_id?: string | null
          payload?: Json
          priority?: number
          push_sent_at?: string | null
          read_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          tag?: string | null
          title?: string
          type?: string
          user_id?: string | null
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
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      reserve_movements: {
        Row: {
          amount_paise: number
          created_at: string
          decision_id: string | null
          expense_id: string | null
          house_id: string
          id: string
          kind: string
          member_id: string | null
          note: string | null
          period_id: string | null
          reserve_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          decision_id?: string | null
          expense_id?: string | null
          house_id: string
          id?: string
          kind: string
          member_id?: string | null
          note?: string | null
          period_id?: string | null
          reserve_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          decision_id?: string | null
          expense_id?: string | null
          house_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          note?: string | null
          period_id?: string | null
          reserve_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserve_movements_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserve_movements_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserve_movements_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserve_movements_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserve_movements_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "monthly_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserve_movements_reserve_id_fkey"
            columns: ["reserve_id"]
            isOneToOne: false
            referencedRelation: "reserves"
            referencedColumns: ["id"]
          },
        ]
      }
      reserves: {
        Row: {
          active: boolean
          balance_paise: number
          created_at: string
          decision_id: string
          house_id: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          balance_paise?: number
          created_at?: string
          decision_id: string
          house_id: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          balance_paise?: number
          created_at?: string
          decision_id?: string
          house_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserves_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserves_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
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
      shopping_items: {
        Row: {
          checked_off: boolean
          checked_off_at: string | null
          checked_off_by: string | null
          created_at: string
          created_by: string
          estimated_price_paise: number | null
          house_id: string
          id: string
          meal_id: string | null
          name: string
          quantity: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          checked_off?: boolean
          checked_off_at?: string | null
          checked_off_by?: string | null
          created_at?: string
          created_by: string
          estimated_price_paise?: number | null
          house_id: string
          id?: string
          meal_id?: string | null
          name: string
          quantity?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          checked_off?: boolean
          checked_off_at?: string | null
          checked_off_by?: string | null
          created_at?: string
          created_by?: string
          estimated_price_paise?: number | null
          house_id?: string
          id?: string
          meal_id?: string | null
          name?: string
          quantity?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_checked_off_by_fkey"
            columns: ["checked_off_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
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
      house_llm_config: {
        Row: {
          base_url: string | null
          capabilities: Json | null
          house_id: string | null
          key_last4: string | null
          last_error: string | null
          last_verified_at: string | null
          model: string | null
          provider: string | null
          status: Database["public"]["Enums"]["llm_credential_status"] | null
          updated_at: string | null
        }
        Insert: {
          base_url?: string | null
          capabilities?: Json | null
          house_id?: string | null
          key_last4?: string | null
          last_error?: string | null
          last_verified_at?: string | null
          model?: string | null
          provider?: string | null
          status?: Database["public"]["Enums"]["llm_credential_status"] | null
          updated_at?: string | null
        }
        Update: {
          base_url?: string | null
          capabilities?: Json | null
          house_id?: string | null
          key_last4?: string | null
          last_error?: string | null
          last_verified_at?: string | null
          model?: string | null
          provider?: string | null
          status?: Database["public"]["Enums"]["llm_credential_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_llm_credentials_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
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
      v_template_last_done: {
        Row: {
          house_id: string | null
          last_done_at: string | null
          last_done_by: string | null
          last_done_by_name: string | null
          name: string | null
          template_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chore_assignments_assignee_member_id_fkey"
            columns: ["last_done_by"]
            isOneToOne: false
            referencedRelation: "house_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_templates_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_join_request: {
        Args: { p_decided_by?: string; p_request_id: string }
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
          pending_settlement: boolean
          removal_decision_id: string | null
          residency: Database["public"]["Enums"]["residency_type"]
          role: Database["public"]["Enums"]["member_role"] | null
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
      add_dependent: {
        Args: {
          p_does_chores?: boolean
          p_guardian_id: string
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
          pending_settlement: boolean
          removal_decision_id: string | null
          residency: Database["public"]["Enums"]["residency_type"]
          role: Database["public"]["Enums"]["member_role"] | null
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
      apply_decision: {
        Args: { p_decision_id: string; p_input?: Json }
        Returns: {
          applied_at: string | null
          auto_approved: boolean
          created_at: string
          deadline: string | null
          house_id: string
          id: string
          level: Database["public"]["Enums"]["decision_level"]
          payload: Json
          reason: string | null
          requested_by: string
          required_acks: number
          required_approvals: number
          resolved_at: string | null
          result: Json | null
          status: Database["public"]["Enums"]["decision_status"]
          subject_id: string | null
          subject_member_id: string | null
          subject_type: string | null
          supersedes_id: string | null
          type: Database["public"]["Enums"]["decision_type"]
        }
        SetofOptions: {
          from: "*"
          to: "decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_decision_effect: {
        Args: {
          p_decision: Database["public"]["Tables"]["decisions"]["Row"]
          p_input?: Json
        }
        Returns: Json
      }
      approve_expense: {
        Args: { p_approve: boolean; p_expense_id: string; p_reason?: string }
        Returns: Database["public"]["Enums"]["expense_status"]
      }
      assign_room: {
        Args: { p_from_date?: string; p_member_id: string; p_room_id: string }
        Returns: string
      }
      attach_chore_details: {
        Args: { p_assignment_id: string; p_note?: string; p_photo_url?: string }
        Returns: Database["public"]["Enums"]["assignment_status"]
      }
      begin_member_removal: {
        Args: { p_decision_id?: string; p_member_id: string }
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
          pending_settlement: boolean
          removal_decision_id: string | null
          residency: Database["public"]["Enums"]["residency_type"]
          role: Database["public"]["Enums"]["member_role"] | null
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
      call_edge: { Args: { body?: Json; fn: string }; Returns: undefined }
      cancel_decision: {
        Args: { p_decision_id: string }
        Returns: {
          applied_at: string | null
          auto_approved: boolean
          created_at: string
          deadline: string | null
          house_id: string
          id: string
          level: Database["public"]["Enums"]["decision_level"]
          payload: Json
          reason: string | null
          requested_by: string
          required_acks: number
          required_approvals: number
          resolved_at: string | null
          result: Json | null
          status: Database["public"]["Enums"]["decision_status"]
          subject_id: string | null
          subject_member_id: string | null
          subject_type: string | null
          supersedes_id: string | null
          type: Database["public"]["Enums"]["decision_type"]
        }
        SetofOptions: {
          from: "*"
          to: "decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      canonical_food_text: { Args: { p_text: string }; Returns: string }
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
      chore_quorum_for: {
        Args: {
          p_assignee_member_id: string
          p_house_id: string
          p_shared_with?: string[]
        }
        Returns: {
          auto_confirm: boolean
          lead_required: boolean
          required: number
        }[]
      }
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
      complete_pending_removals: { Args: never; Returns: number }
      compute_period_balances: {
        Args: { p_penalty_rate_paise?: number; p_period_id: string }
        Returns: Json
      }
      compute_settlements: { Args: { p_balances: Json }; Returns: Json }
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
      create_decision: {
        Args: {
          p_deadline?: string
          p_house_id: string
          p_level: Database["public"]["Enums"]["decision_level"]
          p_participants: Json
          p_payload?: Json
          p_reason?: string
          p_required_acks?: number
          p_required_approvals?: number
          p_subject_id?: string
          p_subject_member_id?: string
          p_subject_type?: string
          p_supersedes_id?: string
          p_type: Database["public"]["Enums"]["decision_type"]
        }
        Returns: {
          applied_at: string | null
          auto_approved: boolean
          created_at: string
          deadline: string | null
          house_id: string
          id: string
          level: Database["public"]["Enums"]["decision_level"]
          payload: Json
          reason: string | null
          requested_by: string
          required_acks: number
          required_approvals: number
          resolved_at: string | null
          result: Json | null
          status: Database["public"]["Enums"]["decision_status"]
          subject_id: string | null
          subject_member_id: string | null
          subject_type: string | null
          supersedes_id: string | null
          type: Database["public"]["Enums"]["decision_type"]
        }
        SetofOptions: {
          from: "*"
          to: "decisions"
          isOneToOne: true
          isSetofReturn: false
        }
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
          p_area?: string
          p_city?: string
          p_country_code?: string
          p_currency?: string
          p_name: string
          p_state?: string
          p_timezone?: string
          p_type?: Database["public"]["Enums"]["home_type"]
        }
        Returns: {
          house_id: string
          invite_code: string
          invite_token: string
        }[]
      }
      create_meal: {
        Args: {
          p_base_cost_paise?: number
          p_delivery_cost_paise?: number
          p_expense_id?: string
          p_food_id?: string
          p_house_id: string
          p_items?: Json
          p_meal_date: string
          p_meal_type?: Database["public"]["Enums"]["meal_type"]
          p_name: string
          p_note?: string
          p_other_cost_paise?: number
          p_photo_url?: string
          p_prep_cost_paise?: number
          p_recipe_instructions?: string
          p_shares: Json
          p_source?: Database["public"]["Enums"]["meal_source"]
        }
        Returns: string
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
          pending_settlement: boolean
          removal_decision_id: string | null
          residency: Database["public"]["Enums"]["residency_type"]
          role: Database["public"]["Enums"]["member_role"] | null
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
      decision_action_phrase: {
        Args: { p_type: Database["public"]["Enums"]["decision_type"] }
        Returns: string
      }
      decision_effect_authorised: { Args: never; Returns: boolean }
      decline_join_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decline_reason: string | null
          house_id: string
          id: string
          invitation_id: string | null
          member_id: string | null
          message: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "join_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_house_llm_credential: {
        Args: { p_house_id: string }
        Returns: undefined
      }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      delete_room: { Args: { p_room_id: string }; Returns: undefined }
      effect_absence_request: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_balance_adjustment:
        | {
            Args: {
              p_decision: Database["public"]["Tables"]["decisions"]["Row"]
            }
            Returns: Json
          }
        | {
            Args: {
              p_decision: Database["public"]["Tables"]["decisions"]["Row"]
              p_input: Json
            }
            Returns: Json
          }
      effect_change_confirmation_policy: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_change_governance: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_change_home_mode: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_change_rule: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_close_settlement:
        | {
            Args: {
              p_decision: Database["public"]["Tables"]["decisions"]["Row"]
            }
            Returns: Json
          }
        | {
            Args: {
              p_decision: Database["public"]["Tables"]["decisions"]["Row"]
              p_input: Json
            }
            Returns: Json
          }
      effect_create_reserve: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_join_request: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_remove_member: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_reopen_settlement:
        | {
            Args: {
              p_decision: Database["public"]["Tables"]["decisions"]["Row"]
            }
            Returns: Json
          }
        | {
            Args: {
              p_decision: Database["public"]["Tables"]["decisions"]["Row"]
              p_input: Json
            }
            Returns: Json
          }
      effect_reserve_draw: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
      effect_set_expected_contribution: {
        Args: { p_decision: Database["public"]["Tables"]["decisions"]["Row"] }
        Returns: Json
      }
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
          p_even_if_inactive?: boolean
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
      enqueue_user_notification: {
        Args: {
          p_house_id: string
          p_payload?: Json
          p_type: string
          p_user_id: string
          p_vars?: Json
        }
        Returns: string
      }
      ensure_period: {
        Args: { p_house_id: string; p_period: string }
        Returns: string
      }
      escalate_missed_chores: { Args: never; Returns: number }
      expire_decisions: { Args: never; Returns: number }
      foods_safe_for: {
        Args: { p_house_id: string; p_member_ids: string[] }
        Returns: {
          food_id: string
        }[]
      }
      generate_invite_code: { Args: never; Returns: string }
      generate_invite_token: { Args: never; Returns: string }
      has_membership: { Args: { p_house_id: string }; Returns: boolean }
      is_house_admin: { Args: { p_house_id: string }; Returns: boolean }
      is_house_lead: { Args: { p_house_id: string }; Returns: boolean }
      is_house_member: { Args: { p_house_id: string }; Returns: boolean }
      llm_capabilities_well_formed: {
        Args: { p_capabilities: Json }
        Returns: boolean
      }
      lookup_invitation: {
        Args: { p_token: string }
        Returns: {
          home_type: Database["public"]["Enums"]["home_type"]
          house_name: string
          member_count: number
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
      meal_restriction_conflicts: {
        Args: { p_meal_id: string }
        Returns: {
          item_name: string
          member_id: string
          restricted_item: string
          severity: Database["public"]["Enums"]["restriction_severity"]
        }[]
      }
      member_display_name: { Args: { p_member_id: string }; Returns: string }
      member_is_financially_clear: {
        Args: { p_member_id: string }
        Returns: boolean
      }
      merge_food_entries: {
        Args: { p_source_id: string; p_target_id: string }
        Returns: undefined
      }
      next_rule_version_no: { Args: { p_rule_id: string }; Returns: number }
      notify_apply_refused: {
        Args: { p_decision_id: string; p_reason: string }
        Returns: string
      }
      notify_schedule_published: { Args: { p_run_id: string }; Returns: number }
      owns_member_record: { Args: { p_member_id: string }; Returns: boolean }
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
      reject_chore: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: Database["public"]["Enums"]["assignment_status"]
      }
      release_chore: {
        Args: { p_assignment_id: string }
        Returns: Database["public"]["Enums"]["assignment_status"]
      }
      remind_decision_participants: { Args: never; Returns: number }
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
      request_join: {
        Args: { p_message?: string; p_token: string }
        Returns: {
          house_id: string
          house_name: string
          status: string
        }[]
      }
      request_swap: {
        Args: {
          p_assignment_id: string
          p_message?: string
          p_to_member_id: string
        }
        Returns: string
      }
      resolve_decision: {
        Args: { p_decision_id: string }
        Returns: Database["public"]["Enums"]["decision_status"]
      }
      respond_to_swap: {
        Args: { p_accept: boolean; p_swap_id: string }
        Returns: Database["public"]["Enums"]["swap_status"]
      }
      rotate_invitation: {
        Args: { p_house_id: string }
        Returns: {
          created_at: string
          created_by: string
          expires_at: string | null
          house_id: string
          id: string
          revoked_at: string | null
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: true
          isSetofReturn: false
        }
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
          p_type?: Database["public"]["Enums"]["home_type"]
        }
        Returns: undefined
      }
      seed_default_chore_templates: {
        Args: { p_house_id: string }
        Returns: undefined
      }
      set_house_llm_credential: {
        Args: {
          p_base_url: string
          p_house_id: string
          p_key_ciphertext: string
          p_key_iv: string
          p_key_last4: string
          p_key_tag: string
          p_key_version: number
          p_model: string
          p_provider: string
          p_status: Database["public"]["Enums"]["llm_credential_status"]
          p_verified_at?: string
        }
        Returns: undefined
      }
      set_llm_capabilities: {
        Args: { p_capabilities: Json; p_house_id: string }
        Returns: Json
      }
      set_notification_prefs: {
        Args: {
          p_chore_outcomes?: boolean
          p_chore_reminders?: boolean
          p_confirmation_requests?: boolean
          p_decision_outcomes?: boolean
          p_expense_activity?: boolean
          p_house_activity?: boolean
          p_membership?: boolean
          p_quiet_hours_end?: string
          p_quiet_hours_off?: boolean
          p_quiet_hours_start?: string
          p_weekly_digest?: boolean
        }
        Returns: {
          chore_outcomes: boolean
          chore_reminders: boolean
          confirmation_requests: boolean
          decision_outcomes: boolean
          decisions: boolean
          expense_activity: boolean
          house_activity: boolean
          house_id: string
          member_id: string
          membership: boolean
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
      withdraw_join_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decline_reason: string | null
          house_id: string
          id: string
          invitation_id: string | null
          member_id: string | null
          message: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "join_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      absence_status:
        | "waiting"
        | "approved"
        | "rejected"
        | "cancelled"
        | "lapsed"
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
      confirmation_policy: "size_aware" | "single" | "off"
      decision_level: "normal" | "important" | "critical"
      decision_status:
        | "waiting"
        | "approved"
        | "rejected"
        | "lapsed"
        | "cancelled"
        | "applied"
      decision_type:
        | "close_settlement"
        | "reopen_settlement"
        | "remove_member"
        | "change_rule"
        | "change_governance"
        | "change_home_mode"
        | "balance_adjustment"
        | "absence_request"
        | "join_request"
        | "expense_approval"
        | "chore_confirmation"
        | "set_expected_contribution"
        | "create_reserve"
        | "reserve_draw"
        | "change_confirmation_policy"
      effort_mode: "points" | "rota"
      exception_type: "away" | "home_all_day" | "custom_hours"
      expense_status: "pending_approval" | "approved" | "rejected" | "void"
      food_rating: "like" | "okay" | "dislike"
      home_type: "shared" | "family"
      llm_credential_status: "unverified" | "active" | "failing" | "disabled"
      llm_purpose:
        | "schedule"
        | "digest"
        | "nl_parse"
        | "rule_parse"
        | "food_ideas"
        | "food_normalise"
      meal_source: "home_cooked" | "bought" | "ordered" | "other"
      meal_type: "breakfast" | "lunch" | "dinner" | "snack" | "other"
      member_kind: "adult" | "dependent"
      member_role: "admin" | "co_admin" | "member"
      member_status: "requested" | "active" | "inactive"
      money_mode: "split" | "pot"
      notify_channel: "push" | "in_app"
      period_status: "open" | "closing" | "closed" | "reopened"
      residency_type: "full_time" | "weekday_only" | "weekend_only"
      response_capacity: "approver" | "acknowledger"
      response_kind: "approve" | "reject" | "acknowledge"
      restriction_severity: "allergy" | "intolerance" | "diet"
      rule_parse_source: "manual" | "ai"
      rule_status: "draft" | "proposed" | "active" | "disabled" | "superseded"
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
      absence_status: [
        "waiting",
        "approved",
        "rejected",
        "cancelled",
        "lapsed",
      ],
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
      confirmation_policy: ["size_aware", "single", "off"],
      decision_level: ["normal", "important", "critical"],
      decision_status: [
        "waiting",
        "approved",
        "rejected",
        "lapsed",
        "cancelled",
        "applied",
      ],
      decision_type: [
        "close_settlement",
        "reopen_settlement",
        "remove_member",
        "change_rule",
        "change_governance",
        "change_home_mode",
        "balance_adjustment",
        "absence_request",
        "join_request",
        "expense_approval",
        "chore_confirmation",
        "set_expected_contribution",
        "create_reserve",
        "reserve_draw",
        "change_confirmation_policy",
      ],
      effort_mode: ["points", "rota"],
      exception_type: ["away", "home_all_day", "custom_hours"],
      expense_status: ["pending_approval", "approved", "rejected", "void"],
      food_rating: ["like", "okay", "dislike"],
      home_type: ["shared", "family"],
      llm_credential_status: ["unverified", "active", "failing", "disabled"],
      llm_purpose: [
        "schedule",
        "digest",
        "nl_parse",
        "rule_parse",
        "food_ideas",
        "food_normalise",
      ],
      meal_source: ["home_cooked", "bought", "ordered", "other"],
      meal_type: ["breakfast", "lunch", "dinner", "snack", "other"],
      member_kind: ["adult", "dependent"],
      member_role: ["admin", "co_admin", "member"],
      member_status: ["requested", "active", "inactive"],
      money_mode: ["split", "pot"],
      notify_channel: ["push", "in_app"],
      period_status: ["open", "closing", "closed", "reopened"],
      residency_type: ["full_time", "weekday_only", "weekend_only"],
      response_capacity: ["approver", "acknowledger"],
      response_kind: ["approve", "reject", "acknowledge"],
      restriction_severity: ["allergy", "intolerance", "diet"],
      rule_parse_source: ["manual", "ai"],
      rule_status: ["draft", "proposed", "active", "disabled", "superseded"],
      settlement_status: ["pending", "marked_paid", "confirmed"],
      split_basis: ["equal", "room_rent", "custom", "payer"],
      swap_status: ["pending", "accepted", "declined", "expired"],
    },
  },
} as const

