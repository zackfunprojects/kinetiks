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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      hv_accounts_config: {
        Row: {
          created_at: string
          id: string
          kinetiks_id: string
          onboarding_state: Json | null
          outreach_goal: Json
          sender_profile: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kinetiks_id: string
          onboarding_state?: Json | null
          outreach_goal?: Json
          sender_profile?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kinetiks_id?: string
          onboarding_state?: Json | null
          outreach_goal?: Json
          sender_profile?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hv_accounts_config_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_activities: {
        Row: {
          contact_id: string | null
          content: Json | null
          created_at: string | null
          deal_id: string | null
          id: string
          kinetiks_id: string
          org_id: string | null
          source_app: string | null
          source_operator: string | null
          type: string
        }
        Insert: {
          contact_id?: string | null
          content?: Json | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          kinetiks_id: string
          org_id?: string | null
          source_app?: string | null
          source_operator?: string | null
          type: string
        }
        Update: {
          contact_id?: string | null
          content?: Json | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          kinetiks_id?: string
          org_id?: string | null
          source_app?: string | null
          source_operator?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hv_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "hv_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "hv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_activities_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "hv_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_analytics: {
        Row: {
          calculated_at: string | null
          campaign_id: string | null
          id: string
          kinetiks_id: string
          metrics: Json
          period: string
          period_end: string | null
          period_start: string | null
          report_type: string
          sequence_id: string | null
        }
        Insert: {
          calculated_at?: string | null
          campaign_id?: string | null
          id?: string
          kinetiks_id: string
          metrics?: Json
          period: string
          period_end?: string | null
          period_start?: string | null
          report_type: string
          sequence_id?: string | null
        }
        Update: {
          calculated_at?: string | null
          campaign_id?: string | null
          id?: string
          kinetiks_id?: string
          metrics?: Json
          period?: string
          period_end?: string | null
          period_start?: string | null
          report_type?: string
          sequence_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_analytics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "hv_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_analytics_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_analytics_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "hv_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_approvals: {
        Row: {
          app: string
          context: Json
          created_at: string | null
          expires_at: string | null
          function_name: string
          id: string
          kinetiks_id: string
          operator: string
          priority: string
          reference_id: string | null
          reference_type: string | null
          resolution_data: Json | null
          resolved_at: string | null
          resolved_by: string | null
          slack_message_ts: string | null
          status: string
          type: string
          updated_at: string | null
          webhook_delivered: boolean | null
          webhook_delivered_at: string | null
        }
        Insert: {
          app?: string
          context?: Json
          created_at?: string | null
          expires_at?: string | null
          function_name: string
          id?: string
          kinetiks_id: string
          operator: string
          priority?: string
          reference_id?: string | null
          reference_type?: string | null
          resolution_data?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          slack_message_ts?: string | null
          status?: string
          type: string
          updated_at?: string | null
          webhook_delivered?: boolean | null
          webhook_delivered_at?: string | null
        }
        Update: {
          app?: string
          context?: Json
          created_at?: string | null
          expires_at?: string | null
          function_name?: string
          id?: string
          kinetiks_id?: string
          operator?: string
          priority?: string
          reference_id?: string | null
          reference_type?: string | null
          resolution_data?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          slack_message_ts?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          webhook_delivered?: boolean | null
          webhook_delivered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_approvals_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_calls: {
        Row: {
          call_type: string
          campaign_id: string | null
          contact_id: string
          created_at: string | null
          duration_seconds: number | null
          elevenlabs_agent_id: string | null
          elevenlabs_conversation_id: string | null
          ended_at: string | null
          id: string
          key_moments: Json | null
          kinetiks_id: string
          org_id: string | null
          outcome: string | null
          phone_from: string
          phone_to: string
          scheduled_at: string | null
          script: Json | null
          sentinel_flags: Json | null
          sentinel_verdict: string | null
          sequence_id: string | null
          started_at: string | null
          status: string
          step_number: number | null
          transcript: string | null
          twilio_call_sid: string | null
          updated_at: string | null
          voice_id: string | null
        }
        Insert: {
          call_type?: string
          campaign_id?: string | null
          contact_id: string
          created_at?: string | null
          duration_seconds?: number | null
          elevenlabs_agent_id?: string | null
          elevenlabs_conversation_id?: string | null
          ended_at?: string | null
          id?: string
          key_moments?: Json | null
          kinetiks_id: string
          org_id?: string | null
          outcome?: string | null
          phone_from: string
          phone_to: string
          scheduled_at?: string | null
          script?: Json | null
          sentinel_flags?: Json | null
          sentinel_verdict?: string | null
          sequence_id?: string | null
          started_at?: string | null
          status?: string
          step_number?: number | null
          transcript?: string | null
          twilio_call_sid?: string | null
          updated_at?: string | null
          voice_id?: string | null
        }
        Update: {
          call_type?: string
          campaign_id?: string | null
          contact_id?: string
          created_at?: string | null
          duration_seconds?: number | null
          elevenlabs_agent_id?: string | null
          elevenlabs_conversation_id?: string | null
          ended_at?: string | null
          id?: string
          key_moments?: Json | null
          kinetiks_id?: string
          org_id?: string | null
          outcome?: string | null
          phone_from?: string
          phone_to?: string
          scheduled_at?: string | null
          script?: Json | null
          sentinel_flags?: Json | null
          sentinel_verdict?: string | null
          sequence_id?: string | null
          started_at?: string | null
          status?: string
          step_number?: number | null
          transcript?: string | null
          twilio_call_sid?: string | null
          updated_at?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "hv_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "hv_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_calls_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "hv_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_calls_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "hv_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_campaigns: {
        Row: {
          created_at: string | null
          id: string
          kinetiks_id: string
          name: string
          playbook_type: string | null
          prospect_filter: Json | null
          sequence_id: string | null
          stats: Json | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kinetiks_id: string
          name: string
          playbook_type?: string | null
          prospect_filter?: Json | null
          sequence_id?: string | null
          stats?: Json | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kinetiks_id?: string
          name?: string
          playbook_type?: string | null
          prospect_filter?: Json | null
          sequence_id?: string | null
          stats?: Json | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_campaigns_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_campaigns_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "hv_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_confidence: {
        Row: {
          agreement_rate: number | null
          function_name: string
          id: string
          kinetiks_id: string
          last_calculated: string | null
          min_agreement_for_autopilot: number | null
          min_decisions_for_approvals: number | null
          min_decisions_for_autopilot: number | null
          mode: string
          operator: string
          outcome_score: number | null
          outcomes_negative: number | null
          outcomes_positive: number | null
          total_decisions: number | null
          unlock_eligible: boolean | null
          user_approved_unchanged: number | null
          user_edited: number | null
          user_rejected: number | null
        }
        Insert: {
          agreement_rate?: number | null
          function_name: string
          id?: string
          kinetiks_id: string
          last_calculated?: string | null
          min_agreement_for_autopilot?: number | null
          min_decisions_for_approvals?: number | null
          min_decisions_for_autopilot?: number | null
          mode?: string
          operator: string
          outcome_score?: number | null
          outcomes_negative?: number | null
          outcomes_positive?: number | null
          total_decisions?: number | null
          unlock_eligible?: boolean | null
          user_approved_unchanged?: number | null
          user_edited?: number | null
          user_rejected?: number | null
        }
        Update: {
          agreement_rate?: number | null
          function_name?: string
          id?: string
          kinetiks_id?: string
          last_calculated?: string | null
          min_agreement_for_autopilot?: number | null
          min_decisions_for_approvals?: number | null
          min_decisions_for_autopilot?: number | null
          mode?: string
          operator?: string
          outcome_score?: number | null
          outcomes_negative?: number | null
          outcomes_positive?: number | null
          total_decisions?: number | null
          unlock_eligible?: boolean | null
          user_approved_unchanged?: number | null
          user_edited?: number | null
          user_rejected?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_confidence_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_contacts: {
        Row: {
          created_at: string | null
          department: string | null
          email: string | null
          engagement_score: number | null
          enrichment_data: Json | null
          enrichment_sources: string[] | null
          first_name: string | null
          fit_score: number | null
          id: string
          intent_score: number | null
          is_eu: boolean | null
          kinetiks_id: string
          last_enriched_at: string | null
          last_name: string | null
          last_verified_at: string | null
          lead_score: number | null
          linkedin_url: string | null
          location_city: string | null
          location_country: string | null
          location_state: string | null
          mutual_connections: Json | null
          notes: string | null
          org_id: string | null
          phone: string | null
          role_type: string | null
          seniority: string | null
          source: string
          suppressed: boolean | null
          suppressed_at: string | null
          suppression_reason: string | null
          tags: string[] | null
          timezone: string | null
          title: string | null
          updated_at: string | null
          verification_details: Json | null
          verification_grade: string | null
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          email?: string | null
          engagement_score?: number | null
          enrichment_data?: Json | null
          enrichment_sources?: string[] | null
          first_name?: string | null
          fit_score?: number | null
          id?: string
          intent_score?: number | null
          is_eu?: boolean | null
          kinetiks_id: string
          last_enriched_at?: string | null
          last_name?: string | null
          last_verified_at?: string | null
          lead_score?: number | null
          linkedin_url?: string | null
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          mutual_connections?: Json | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          role_type?: string | null
          seniority?: string | null
          source?: string
          suppressed?: boolean | null
          suppressed_at?: string | null
          suppression_reason?: string | null
          tags?: string[] | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          verification_details?: Json | null
          verification_grade?: string | null
        }
        Update: {
          created_at?: string | null
          department?: string | null
          email?: string | null
          engagement_score?: number | null
          enrichment_data?: Json | null
          enrichment_sources?: string[] | null
          first_name?: string | null
          fit_score?: number | null
          id?: string
          intent_score?: number | null
          is_eu?: boolean | null
          kinetiks_id?: string
          last_enriched_at?: string | null
          last_name?: string | null
          last_verified_at?: string | null
          lead_score?: number | null
          linkedin_url?: string | null
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          mutual_connections?: Json | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          role_type?: string | null
          seniority?: string | null
          source?: string
          suppressed?: boolean | null
          suppressed_at?: string | null
          suppression_reason?: string | null
          tags?: string[] | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          verification_details?: Json | null
          verification_grade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_contacts_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "hv_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_deals: {
        Row: {
          attribution_campaign_id: string | null
          attribution_channel: string | null
          attribution_first_touch_at: string | null
          attribution_sequence_id: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          id: string
          kinetiks_id: string
          loss_reason_category: string | null
          loss_reason_detail: string | null
          lost_to_competitor: string | null
          name: string
          notes: string | null
          org_id: string | null
          stage: string
          updated_at: string | null
          value: number | null
          win_reason_category: string | null
          win_reason_detail: string | null
        }
        Insert: {
          attribution_campaign_id?: string | null
          attribution_channel?: string | null
          attribution_first_touch_at?: string | null
          attribution_sequence_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          kinetiks_id: string
          loss_reason_category?: string | null
          loss_reason_detail?: string | null
          lost_to_competitor?: string | null
          name: string
          notes?: string | null
          org_id?: string | null
          stage?: string
          updated_at?: string | null
          value?: number | null
          win_reason_category?: string | null
          win_reason_detail?: string | null
        }
        Update: {
          attribution_campaign_id?: string | null
          attribution_channel?: string | null
          attribution_first_touch_at?: string | null
          attribution_sequence_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          kinetiks_id?: string
          loss_reason_category?: string | null
          loss_reason_detail?: string | null
          lost_to_competitor?: string | null
          name?: string
          notes?: string | null
          org_id?: string | null
          stage?: string
          updated_at?: string | null
          value?: number | null
          win_reason_category?: string | null
          win_reason_detail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_deals_attribution_campaign_id_fkey"
            columns: ["attribution_campaign_id"]
            isOneToOne: false
            referencedRelation: "hv_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_deals_attribution_sequence_id_fkey"
            columns: ["attribution_sequence_id"]
            isOneToOne: false
            referencedRelation: "hv_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "hv_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_deals_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "hv_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_domains: {
        Row: {
          created_at: string | null
          dns_status: Json | null
          domain: string
          google_postmaster_data: Json | null
          health_score: number | null
          id: string
          is_primary: boolean | null
          kinetiks_id: string
          registrar: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dns_status?: Json | null
          domain: string
          google_postmaster_data?: Json | null
          health_score?: number | null
          id?: string
          is_primary?: boolean | null
          kinetiks_id: string
          registrar?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dns_status?: Json | null
          domain?: string
          google_postmaster_data?: Json | null
          health_score?: number | null
          id?: string
          is_primary?: boolean | null
          kinetiks_id?: string
          registrar?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_domains_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_emails: {
        Row: {
          body: string
          body_plain: string | null
          bounced_at: string | null
          campaign_id: string | null
          cc_contact_id: string | null
          clicked_at: string | null
          contact_id: string
          created_at: string | null
          id: string
          in_reply_to_id: string | null
          kinetiks_id: string
          mailbox_id: string | null
          message_id: string | null
          opened_at: string | null
          org_id: string | null
          replied_at: string | null
          reply_body: string | null
          reply_classification: string | null
          reply_sentiment: string | null
          research_brief: Json | null
          scheduled_at: string | null
          sent_at: string | null
          sentinel_flags: Json | null
          sentinel_quality_score: number | null
          sentinel_verdict: string | null
          sequence_id: string | null
          status: string
          step_number: number | null
          style_config: Json | null
          subject: string
          thread_id: string | null
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          body: string
          body_plain?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          cc_contact_id?: string | null
          clicked_at?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          in_reply_to_id?: string | null
          kinetiks_id: string
          mailbox_id?: string | null
          message_id?: string | null
          opened_at?: string | null
          org_id?: string | null
          replied_at?: string | null
          reply_body?: string | null
          reply_classification?: string | null
          reply_sentiment?: string | null
          research_brief?: Json | null
          scheduled_at?: string | null
          sent_at?: string | null
          sentinel_flags?: Json | null
          sentinel_quality_score?: number | null
          sentinel_verdict?: string | null
          sequence_id?: string | null
          status?: string
          step_number?: number | null
          style_config?: Json | null
          subject: string
          thread_id?: string | null
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          body?: string
          body_plain?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          cc_contact_id?: string | null
          clicked_at?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          in_reply_to_id?: string | null
          kinetiks_id?: string
          mailbox_id?: string | null
          message_id?: string | null
          opened_at?: string | null
          org_id?: string | null
          replied_at?: string | null
          reply_body?: string | null
          reply_classification?: string | null
          reply_sentiment?: string | null
          research_brief?: Json | null
          scheduled_at?: string | null
          sent_at?: string | null
          sentinel_flags?: Json | null
          sentinel_quality_score?: number | null
          sentinel_verdict?: string | null
          sequence_id?: string | null
          status?: string
          step_number?: number | null
          style_config?: Json | null
          subject?: string
          thread_id?: string | null
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_emails_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "hv_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_emails_cc_contact_id_fkey"
            columns: ["cc_contact_id"]
            isOneToOne: false
            referencedRelation: "hv_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "hv_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_emails_in_reply_to_id_fkey"
            columns: ["in_reply_to_id"]
            isOneToOne: false
            referencedRelation: "hv_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_emails_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_emails_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "hv_mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_emails_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "hv_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_emails_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "hv_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_enrollments: {
        Row: {
          campaign_id: string | null
          completed_at: string | null
          contact_id: string
          created_at: string | null
          current_step: number
          id: string
          kinetiks_id: string
          next_step_at: string | null
          paused_at: string | null
          sequence_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          campaign_id?: string | null
          completed_at?: string | null
          contact_id: string
          created_at?: string | null
          current_step?: number
          id?: string
          kinetiks_id: string
          next_step_at?: string | null
          paused_at?: string | null
          sequence_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string | null
          completed_at?: string | null
          contact_id?: string
          created_at?: string | null
          current_step?: number
          id?: string
          kinetiks_id?: string
          next_step_at?: string | null
          paused_at?: string | null
          sequence_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hv_enrollments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "hv_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "hv_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_enrollments_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "hv_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_mailboxes: {
        Row: {
          created_at: string | null
          daily_limit: number | null
          daily_sent_today: number | null
          display_name: string
          domain_id: string | null
          email: string
          id: string
          is_active: boolean | null
          kinetiks_id: string
          last_health_check: string | null
          pause_reason: string | null
          provider: string
          reputation_score: number | null
          signature_html: string | null
          smtp_config: Json | null
          updated_at: string | null
          warmup_daily_target: number | null
          warmup_day: number | null
          warmup_status: string
        }
        Insert: {
          created_at?: string | null
          daily_limit?: number | null
          daily_sent_today?: number | null
          display_name: string
          domain_id?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          kinetiks_id: string
          last_health_check?: string | null
          pause_reason?: string | null
          provider?: string
          reputation_score?: number | null
          signature_html?: string | null
          smtp_config?: Json | null
          updated_at?: string | null
          warmup_daily_target?: number | null
          warmup_day?: number | null
          warmup_status?: string
        }
        Update: {
          created_at?: string | null
          daily_limit?: number | null
          daily_sent_today?: number | null
          display_name?: string
          domain_id?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          kinetiks_id?: string
          last_health_check?: string | null
          pause_reason?: string | null
          provider?: string
          reputation_score?: number | null
          signature_html?: string | null
          smtp_config?: Json | null
          updated_at?: string | null
          warmup_daily_target?: number | null
          warmup_day?: number | null
          warmup_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hv_mailboxes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "hv_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_mailboxes_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_organizations: {
        Row: {
          annual_revenue_range: string | null
          created_at: string | null
          domain: string | null
          employee_count_range: string | null
          enrichment_data: Json | null
          enrichment_sources: string[] | null
          funding_stage: string | null
          headquarters_city: string | null
          headquarters_country: string | null
          headquarters_state: string | null
          health_score: number | null
          id: string
          industry: string | null
          kinetiks_id: string
          last_enriched_at: string | null
          name: string
          notes: string | null
          signals: Json | null
          tags: string[] | null
          tech_stack: Json | null
          updated_at: string | null
        }
        Insert: {
          annual_revenue_range?: string | null
          created_at?: string | null
          domain?: string | null
          employee_count_range?: string | null
          enrichment_data?: Json | null
          enrichment_sources?: string[] | null
          funding_stage?: string | null
          headquarters_city?: string | null
          headquarters_country?: string | null
          headquarters_state?: string | null
          health_score?: number | null
          id?: string
          industry?: string | null
          kinetiks_id: string
          last_enriched_at?: string | null
          name: string
          notes?: string | null
          signals?: Json | null
          tags?: string[] | null
          tech_stack?: Json | null
          updated_at?: string | null
        }
        Update: {
          annual_revenue_range?: string | null
          created_at?: string | null
          domain?: string | null
          employee_count_range?: string | null
          enrichment_data?: Json | null
          enrichment_sources?: string[] | null
          funding_stage?: string | null
          headquarters_city?: string | null
          headquarters_country?: string | null
          headquarters_state?: string | null
          health_score?: number | null
          id?: string
          industry?: string | null
          kinetiks_id?: string
          last_enriched_at?: string | null
          name?: string
          notes?: string | null
          signals?: Json | null
          tags?: string[] | null
          tech_stack?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_organizations_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_sequences: {
        Row: {
          created_at: string | null
          id: string
          kinetiks_id: string
          name: string
          stats: Json | null
          status: string
          steps: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kinetiks_id: string
          name: string
          stats?: Json | null
          status?: string
          steps?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kinetiks_id?: string
          name?: string
          stats?: Json | null
          status?: string
          steps?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_sequences_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_style_presets: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          is_default: boolean | null
          kinetiks_id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          kinetiks_id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          kinetiks_id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_style_presets_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_suppressions: {
        Row: {
          created_at: string | null
          domain: string | null
          email: string | null
          id: string
          kinetiks_id: string
          phone: string | null
          reason: string | null
          source_app: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          kinetiks_id: string
          phone?: string | null
          reason?: string | null
          source_app?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          kinetiks_id?: string
          phone?: string | null
          reason?: string | null
          source_app?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hv_suppressions_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_templates: {
        Row: {
          body_template: string
          category: string
          created_at: string
          id: string
          is_ai_generated: boolean
          kinetiks_id: string
          merge_fields: Json
          name: string
          performance: Json
          style_preset_id: string | null
          subject_template: string
          updated_at: string
        }
        Insert: {
          body_template?: string
          category?: string
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          kinetiks_id: string
          merge_fields?: Json
          name: string
          performance?: Json
          style_preset_id?: string | null
          subject_template?: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          category?: string
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          kinetiks_id?: string
          merge_fields?: Json
          name?: string
          performance?: Json
          style_preset_id?: string | null
          subject_template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hv_templates_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_templates_style_preset_id_fkey"
            columns: ["style_preset_id"]
            isOneToOne: false
            referencedRelation: "hv_style_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_tracking_events: {
        Row: {
          click_url: string | null
          contact_id: string | null
          created_at: string | null
          email_id: string
          event_type: string
          id: string
          ip_address: string | null
          kinetiks_id: string
          metadata: Json | null
          occurred_at: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          click_url?: string | null
          contact_id?: string | null
          created_at?: string | null
          email_id: string
          event_type: string
          id?: string
          ip_address?: string | null
          kinetiks_id: string
          metadata?: Json | null
          occurred_at?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          click_url?: string | null
          contact_id?: string | null
          created_at?: string | null
          email_id?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          kinetiks_id?: string
          metadata?: Json | null
          occurred_at?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_tracking_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "hv_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_tracking_events_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "hv_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hv_tracking_events_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_usage: {
        Row: {
          created_at: string | null
          id: string
          kinetiks_id: string
          period_month: string
          quantity: number | null
          reference_id: string | null
          resource: string
          total_cost_cents: number | null
          unit_cost_cents: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kinetiks_id: string
          period_month: string
          quantity?: number | null
          reference_id?: string | null
          resource: string
          total_cost_cents?: number | null
          unit_cost_cents?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kinetiks_id?: string
          period_month?: string
          quantity?: number | null
          reference_id?: string | null
          resource?: string
          total_cost_cents?: number | null
          unit_cost_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hv_usage_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_webhook_configs: {
        Row: {
          consecutive_failures: number | null
          created_at: string | null
          events: string[]
          id: string
          is_active: boolean | null
          kinetiks_id: string
          last_delivered_at: string | null
          secret: string
          updated_at: string | null
          url: string
        }
        Insert: {
          consecutive_failures?: number | null
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          kinetiks_id: string
          last_delivered_at?: string | null
          secret: string
          updated_at?: string | null
          url: string
        }
        Update: {
          consecutive_failures?: number | null
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          kinetiks_id?: string
          last_delivered_at?: string | null
          secret?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "hv_webhook_configs_kinetiks_id_fkey"
            columns: ["kinetiks_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_webhook_events: {
        Row: {
          created_at: string | null
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
          source: string
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          source: string
        }
        Update: {
          created_at?: string | null
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          source?: string
        }
        Relationships: []
      }
      kinetiks_accounts: {
        Row: {
          authority_defaults_reviewed_at: string | null
          codename: string
          created_at: string | null
          display_name: string | null
          from_app: string | null
          id: string
          kinetiks_connected: boolean | null
          nango_end_user_id: string | null
          onboarding_complete: boolean | null
          system_name: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          authority_defaults_reviewed_at?: string | null
          codename: string
          created_at?: string | null
          display_name?: string | null
          from_app?: string | null
          id?: string
          kinetiks_connected?: boolean | null
          nango_end_user_id?: string | null
          onboarding_complete?: boolean | null
          system_name?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          authority_defaults_reviewed_at?: string | null
          codename?: string
          created_at?: string | null
          display_name?: string | null
          from_app?: string | null
          id?: string
          kinetiks_connected?: boolean | null
          nango_end_user_id?: string | null
          onboarding_complete?: boolean | null
          system_name?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      kinetiks_active_tasks: {
        Row: {
          account_id: string
          app_name: string
          command_id: string | null
          current_step_index: number
          description: string | null
          ended_at: string | null
          id: string
          kill_feedback: string | null
          kill_reason_code: string | null
          name: string
          progress: number
          source_app: string
          started_at: string
          status: string
          steps: Json
          team_scope_id: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          app_name: string
          command_id?: string | null
          current_step_index?: number
          description?: string | null
          ended_at?: string | null
          id?: string
          kill_feedback?: string | null
          kill_reason_code?: string | null
          name: string
          progress?: number
          source_app?: string
          started_at?: string
          status?: string
          steps?: Json
          team_scope_id?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          app_name?: string
          command_id?: string | null
          current_step_index?: number
          description?: string | null
          ended_at?: string | null
          id?: string
          kill_feedback?: string | null
          kill_reason_code?: string | null
          name?: string
          progress?: number
          source_app?: string
          started_at?: string
          status?: string
          steps?: Json
          team_scope_id?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_active_tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          revoked_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      kinetiks_ai_calls: {
        Row: {
          account_id: string | null
          agent_run_id: string | null
          approval_id: string | null
          attempt_number: number
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          completed_at: string | null
          correlation_id: string | null
          cost_usd: number | null
          error_class: string | null
          error_message: string | null
          grant_id: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          metadata: Json
          model: string
          output_tokens: number | null
          parent_call_id: string | null
          pattern_id: string | null
          prompt_version: string | null
          proposal_id: string | null
          started_at: string
          status: string
          task: string
          team_scope_id: string | null
          thread_id: string | null
          tool_call_id: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          agent_run_id?: string | null
          approval_id?: string | null
          attempt_number?: number
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          completed_at?: string | null
          correlation_id?: string | null
          cost_usd?: number | null
          error_class?: string | null
          error_message?: string | null
          grant_id?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json
          model: string
          output_tokens?: number | null
          parent_call_id?: string | null
          pattern_id?: string | null
          prompt_version?: string | null
          proposal_id?: string | null
          started_at?: string
          status: string
          task: string
          team_scope_id?: string | null
          thread_id?: string | null
          tool_call_id?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          agent_run_id?: string | null
          approval_id?: string | null
          attempt_number?: number
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          completed_at?: string | null
          correlation_id?: string | null
          cost_usd?: number | null
          error_class?: string | null
          error_message?: string | null
          grant_id?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json
          model?: string
          output_tokens?: number | null
          parent_call_id?: string | null
          pattern_id?: string | null
          prompt_version?: string | null
          proposal_id?: string | null
          started_at?: string
          status?: string
          task?: string
          team_scope_id?: string | null
          thread_id?: string | null
          tool_call_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_ai_calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_ai_calls_parent_call_id_fkey"
            columns: ["parent_call_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_ai_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_analytics_metrics: {
        Row: {
          account_id: string
          dimensions: Json | null
          id: string
          metric_key: string
          metric_period: string
          metric_value: number
          period_start: string
          recorded_at: string | null
          source_app: string
        }
        Insert: {
          account_id: string
          dimensions?: Json | null
          id?: string
          metric_key: string
          metric_period: string
          metric_value: number
          period_start: string
          recorded_at?: string | null
          source_app: string
        }
        Update: {
          account_id?: string
          dimensions?: Json | null
          id?: string
          metric_key?: string
          metric_period?: string
          metric_value?: number
          period_start?: string
          recorded_at?: string | null
          source_app?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_analytics_metrics_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_annotations: {
        Row: {
          account_id: string
          body: string
          component_id: string
          created_at: string
          dismissed: boolean
          evidence_refs: Json
          field_name: string
          id: string
          kind: string
          max_width: number
          pinned: boolean
          position: string
          replies: Json
          source_app: string
          summary: string
          team_scope_id: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          body: string
          component_id: string
          created_at?: string
          dismissed?: boolean
          evidence_refs?: Json
          field_name: string
          id?: string
          kind: string
          max_width?: number
          pinned?: boolean
          position?: string
          replies?: Json
          source_app?: string
          summary: string
          team_scope_id?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          body?: string
          component_id?: string
          created_at?: string
          dismissed?: boolean
          evidence_refs?: Json
          field_name?: string
          id?: string
          kind?: string
          max_width?: number
          pinned?: boolean
          position?: string
          replies?: Json
          source_app?: string
          summary?: string
          team_scope_id?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_annotations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_api_keys: {
        Row: {
          account_id: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: string
          rate_limit_per_day: number
          rate_limit_per_minute: number
          scope: string[]
        }
        Insert: {
          account_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: string
          rate_limit_per_day?: number
          rate_limit_per_minute?: number
          scope?: string[]
        }
        Update: {
          account_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: string
          rate_limit_per_day?: number
          rate_limit_per_minute?: number
          scope?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_api_keys_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_app_activations: {
        Row: {
          account_id: string
          activated_at: string | null
          app_name: string
          id: string
          status: string | null
        }
        Insert: {
          account_id: string
          activated_at?: string | null
          app_name: string
          id?: string
          status?: string | null
        }
        Update: {
          account_id?: string
          activated_at?: string | null
          app_name?: string
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_app_activations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_approval_thresholds: {
        Row: {
          account_id: string
          action_category: string
          approval_rate: number | null
          auto_approve_threshold: number | null
          consecutive_approvals: number | null
          edit_rate: number | null
          id: string
          last_rejection_at: string | null
          override_rule: string | null
          total_approvals: number | null
          total_rejections: number | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          action_category: string
          approval_rate?: number | null
          auto_approve_threshold?: number | null
          consecutive_approvals?: number | null
          edit_rate?: number | null
          id?: string
          last_rejection_at?: string | null
          override_rule?: string | null
          total_approvals?: number | null
          total_rejections?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          action_category?: string
          approval_rate?: number | null
          auto_approve_threshold?: number | null
          consecutive_approvals?: number | null
          edit_rate?: number | null
          id?: string
          last_rejection_at?: string | null
          override_rule?: string | null
          total_approvals?: number | null
          total_rejections?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_approval_thresholds_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_approvals: {
        Row: {
          account_id: string
          acted_at: string | null
          action_category: string
          approval_class: string
          approval_type: string
          auto_approved: boolean
          brand_gate_result: Json | null
          confidence_breakdown: Json | null
          confidence_score: number | null
          created_at: string | null
          deep_link: string | null
          description: string | null
          edit_classification: Json | null
          expires_at: string | null
          id: string
          preview: Json
          quality_gate_result: Json | null
          rejection_classification: string | null
          rejection_reason: string | null
          source_app: string
          source_operator: string | null
          status: string
          title: string
          user_edits: Json | null
        }
        Insert: {
          account_id: string
          acted_at?: string | null
          action_category: string
          approval_class?: string
          approval_type: string
          auto_approved?: boolean
          brand_gate_result?: Json | null
          confidence_breakdown?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          deep_link?: string | null
          description?: string | null
          edit_classification?: Json | null
          expires_at?: string | null
          id?: string
          preview?: Json
          quality_gate_result?: Json | null
          rejection_classification?: string | null
          rejection_reason?: string | null
          source_app: string
          source_operator?: string | null
          status?: string
          title: string
          user_edits?: Json | null
        }
        Update: {
          account_id?: string
          acted_at?: string | null
          action_category?: string
          approval_class?: string
          approval_type?: string
          auto_approved?: boolean
          brand_gate_result?: Json | null
          confidence_breakdown?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          deep_link?: string | null
          description?: string | null
          edit_classification?: Json | null
          expires_at?: string | null
          id?: string
          preview?: Json
          quality_gate_result?: Json | null
          rejection_classification?: string | null
          rejection_reason?: string | null
          source_app?: string
          source_operator?: string | null
          status?: string
          title?: string
          user_edits?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_approvals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_attribution_touchpoints: {
        Row: {
          account_id: string
          action_type: string
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          detail: string | null
          id: string
          source_app: string
          timestamp: string
        }
        Insert: {
          account_id: string
          action_type: string
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          detail?: string | null
          id?: string
          source_app: string
          timestamp: string
        }
        Update: {
          account_id?: string
          action_type?: string
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          detail?: string | null
          id?: string
          source_app?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_attribution_touchpoints_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_authority_grants: {
        Row: {
          account_id: string
          budget_category: string | null
          created_at: string
          default_origin_app: string | null
          default_origin_key: string | null
          escalation_triggers: Json
          expires_at: string | null
          granted_at: string | null
          granted_by: string
          granted_capabilities: Json
          id: string
          max_unapproved_spend_per_action: number | null
          max_unapproved_spend_per_day: number | null
          parent_grant_id: string | null
          proposed_at: string
          proposed_by_agent: string | null
          revocation_reason: string | null
          revoked_at: string | null
          scope_description: string
          scope_id: string | null
          scope_type: string
          spending_currency: string
          status: string
          team_scope_id: string | null
          updated_at: string
          usage_summary: Json
        }
        Insert: {
          account_id: string
          budget_category?: string | null
          created_at?: string
          default_origin_app?: string | null
          default_origin_key?: string | null
          escalation_triggers?: Json
          expires_at?: string | null
          granted_at?: string | null
          granted_by: string
          granted_capabilities: Json
          id?: string
          max_unapproved_spend_per_action?: number | null
          max_unapproved_spend_per_day?: number | null
          parent_grant_id?: string | null
          proposed_at?: string
          proposed_by_agent?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          scope_description: string
          scope_id?: string | null
          scope_type: string
          spending_currency?: string
          status?: string
          team_scope_id?: string | null
          updated_at?: string
          usage_summary?: Json
        }
        Update: {
          account_id?: string
          budget_category?: string | null
          created_at?: string
          default_origin_app?: string | null
          default_origin_key?: string | null
          escalation_triggers?: Json
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string
          granted_capabilities?: Json
          id?: string
          max_unapproved_spend_per_action?: number | null
          max_unapproved_spend_per_day?: number | null
          parent_grant_id?: string | null
          proposed_at?: string
          proposed_by_agent?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          scope_description?: string
          scope_id?: string | null
          scope_type?: string
          spending_currency?: string
          status?: string
          team_scope_id?: string | null
          updated_at?: string
          usage_summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_authority_grants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_authority_grants_parent_grant_id_fkey"
            columns: ["parent_grant_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_authority_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_billing: {
        Row: {
          account_id: string
          created_at: string | null
          current_period_end: string | null
          id: string
          payment_method_last4: string | null
          plan: string | null
          plan_status: string | null
          seeds_balance: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          payment_method_last4?: string | null
          plan?: string | null
          plan_status?: string | null
          seeds_balance?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          payment_method_last4?: string | null
          plan?: string | null
          plan_status?: string | null
          seeds_balance?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_billing_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_budget_allocations: {
        Row: {
          allocated_amount: number
          app: string | null
          budget_id: string
          category: string
          created_at: string | null
          id: string
          spent_amount: number | null
        }
        Insert: {
          allocated_amount: number
          app?: string | null
          budget_id: string
          category: string
          created_at?: string | null
          id?: string
          spent_amount?: number | null
        }
        Update: {
          allocated_amount?: number
          app?: string | null
          budget_id?: string
          category?: string
          created_at?: string | null
          id?: string
          spent_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_budget_allocations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_budgets: {
        Row: {
          account_id: string
          approval_status: string | null
          approved_at: string | null
          created_at: string | null
          currency: string | null
          id: string
          period: string | null
          period_end: string
          period_start: string
          total_budget: number
          updated_at: string | null
        }
        Insert: {
          account_id: string
          approval_status?: string | null
          approved_at?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          period?: string | null
          period_end: string
          period_start: string
          total_budget: number
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          approval_status?: string | null
          approved_at?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          period?: string | null
          period_end?: string
          period_start?: string
          total_budget?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_confidence: {
        Row: {
          account_id: string
          aggregate: number | null
          brand: number | null
          competitive: number | null
          customers: number | null
          id: string
          market: number | null
          narrative: number | null
          org: number | null
          products: number | null
          updated_at: string | null
          voice: number | null
        }
        Insert: {
          account_id: string
          aggregate?: number | null
          brand?: number | null
          competitive?: number | null
          customers?: number | null
          id?: string
          market?: number | null
          narrative?: number | null
          org?: number | null
          products?: number | null
          updated_at?: string | null
          voice?: number | null
        }
        Update: {
          account_id?: string
          aggregate?: number | null
          brand?: number | null
          competitive?: number | null
          customers?: number | null
          id?: string
          market?: number | null
          narrative?: number | null
          org?: number | null
          products?: number | null
          updated_at?: string | null
          voice?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_confidence_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_connection_sync_logs: {
        Row: {
          account_id: string
          connection_id: string | null
          created_at: string | null
          duration_ms: number
          error: string | null
          id: string
          proposals_generated: number
          records_processed: number
          status: string
        }
        Insert: {
          account_id: string
          connection_id?: string | null
          created_at?: string | null
          duration_ms?: number
          error?: string | null
          id?: string
          proposals_generated?: number
          records_processed?: number
          status: string
        }
        Update: {
          account_id?: string
          connection_id?: string | null
          created_at?: string | null
          duration_ms?: number
          error?: string | null
          id?: string
          proposals_generated?: number
          records_processed?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_connection_sync_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_connection_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_connections: {
        Row: {
          account_id: string
          created_at: string | null
          credentials: Json | null
          id: string
          last_sync_at: string | null
          metadata: Json | null
          nango_connection_id: string | null
          nango_provider_config_key: string | null
          provider: string
          status: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          credentials?: Json | null
          id?: string
          last_sync_at?: string | null
          metadata?: Json | null
          nango_connection_id?: string | null
          nango_provider_config_key?: string | null
          provider: string
          status?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          credentials?: Json | null
          id?: string
          last_sync_at?: string | null
          metadata?: Json | null
          nango_connection_id?: string | null
          nango_provider_config_key?: string | null
          provider?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_connections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_context_brand: {
        Row: {
          account_id: string
          confidence_score: number | null
          created_at: string | null
          data: Json
          id: string
          source: string
          source_detail: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source?: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_context_brand_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_context_competitive: {
        Row: {
          account_id: string
          confidence_score: number | null
          created_at: string | null
          data: Json
          id: string
          source: string
          source_detail: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source?: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_context_competitive_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_context_customers: {
        Row: {
          account_id: string
          confidence_score: number | null
          created_at: string | null
          data: Json
          id: string
          source: string
          source_detail: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source?: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_context_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_context_market: {
        Row: {
          account_id: string
          confidence_score: number | null
          created_at: string | null
          data: Json
          id: string
          source: string
          source_detail: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source?: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_context_market_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_context_narrative: {
        Row: {
          account_id: string
          confidence_score: number | null
          created_at: string | null
          data: Json
          id: string
          source: string
          source_detail: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source?: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_context_narrative_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_context_org: {
        Row: {
          account_id: string
          confidence_score: number | null
          created_at: string | null
          data: Json
          id: string
          source: string
          source_detail: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source?: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_context_org_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_context_products: {
        Row: {
          account_id: string
          confidence_score: number | null
          created_at: string | null
          data: Json
          id: string
          source: string
          source_detail: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source?: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_context_products_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_context_voice: {
        Row: {
          account_id: string
          confidence_score: number | null
          created_at: string | null
          data: Json
          id: string
          source: string
          source_detail: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          confidence_score?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          source?: string
          source_detail?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_context_voice_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_crm_entities: {
        Row: {
          account_id: string
          created_at: string
          data: Json
          entity_type: string
          external_id: string
          external_updated_at: string | null
          id: string
          source: string
          synced_at: string
          team_scope_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          data: Json
          entity_type: string
          external_id: string
          external_updated_at?: string | null
          id?: string
          source: string
          synced_at?: string
          team_scope_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          data?: Json
          entity_type?: string
          external_id?: string
          external_updated_at?: string | null
          id?: string
          source?: string
          synced_at?: string
          team_scope_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_crm_entities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_daily_counters: {
        Row: {
          account_id: string
          amount: number
          counter_key: string
          created_at: string
          day_utc: string
          id: string
          team_scope_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          counter_key: string
          created_at?: string
          day_utc: string
          id?: string
          team_scope_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          counter_key?: string
          created_at?: string
          day_utc?: string
          id?: string
          team_scope_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_daily_counters_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_escalations: {
        Row: {
          account_id: string
          acknowledged_at: string | null
          context: Json
          created_at: string | null
          delivery_channel: string | null
          id: string
          resolved_at: string | null
          sentinel_review_id: string | null
          severity: string
          source_app: string
          source_operator: string | null
          status: string
        }
        Insert: {
          account_id: string
          acknowledged_at?: string | null
          context?: Json
          created_at?: string | null
          delivery_channel?: string | null
          id?: string
          resolved_at?: string | null
          sentinel_review_id?: string | null
          severity: string
          source_app: string
          source_operator?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          acknowledged_at?: string | null
          context?: Json
          created_at?: string | null
          delivery_channel?: string | null
          id?: string
          resolved_at?: string | null
          sentinel_review_id?: string | null
          severity?: string
          source_app?: string
          source_operator?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_escalations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_escalations_sentinel_review_id_fkey"
            columns: ["sentinel_review_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_sentinel_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_fatigue_rules: {
        Row: {
          account_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          limit_value: number
          period: string
          rule_name: string
          scope: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          limit_value: number
          period: string
          rule_name: string
          scope: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          limit_value?: number
          period?: string
          rule_name?: string
          scope?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_fatigue_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_goal_snapshots: {
        Row: {
          account_id: string
          goal_id: string
          id: string
          snapshot_at: string | null
          value: number
        }
        Insert: {
          account_id: string
          goal_id: string
          id?: string
          snapshot_at?: string | null
          value: number
        }
        Update: {
          account_id?: string
          goal_id?: string
          id?: string
          snapshot_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_goal_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_goal_snapshots_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_goals: {
        Row: {
          account_id: string
          contributing_apps: string[] | null
          created_at: string | null
          current_value: number | null
          direction: string | null
          id: string
          metric_key: string | null
          name: string
          parent_goal_id: string | null
          period_end: string | null
          period_start: string | null
          progress_status: string | null
          status: string | null
          target_period: string | null
          target_value: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          contributing_apps?: string[] | null
          created_at?: string | null
          current_value?: number | null
          direction?: string | null
          id?: string
          metric_key?: string | null
          name: string
          parent_goal_id?: string | null
          period_end?: string | null
          period_start?: string | null
          progress_status?: string | null
          status?: string | null
          target_period?: string | null
          target_value?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          contributing_apps?: string[] | null
          created_at?: string | null
          current_value?: number | null
          direction?: string | null
          id?: string
          metric_key?: string | null
          name?: string
          parent_goal_id?: string | null
          period_end?: string | null
          period_start?: string | null
          progress_status?: string | null
          status?: string | null
          target_period?: string | null
          target_value?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_imports: {
        Row: {
          account_id: string
          created_at: string | null
          file_path: string | null
          id: string
          import_type: string
          stats: Json | null
          status: string | null
          target_app: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          file_path?: string | null
          id?: string
          import_type: string
          stats?: Json | null
          status?: string | null
          target_app?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          file_path?: string | null
          id?: string
          import_type?: string
          stats?: Json | null
          status?: string | null
          target_app?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_imports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_inbound_events: {
        Row: {
          account_id: string
          created_at: string
          event_key: string
          event_type: string
          id: string
          source: string
        }
        Insert: {
          account_id: string
          created_at?: string
          event_key: string
          event_type: string
          id?: string
          source: string
        }
        Update: {
          account_id?: string
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_inbound_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_insights: {
        Row: {
          account_id: string
          acted_on: boolean
          acted_on_at: string | null
          agent_run_id: string | null
          ai_call_id: string | null
          approval_id: string | null
          correlation_id: string | null
          created_at: string
          dedup_key: string | null
          delivered: boolean
          delivered_at: string | null
          delivery_channel: string | null
          dismissed: boolean
          dismissed_at: string | null
          evidence: Json
          expires_at: string | null
          grant_id: string | null
          id: string
          pattern_id: string | null
          proposal_id: string | null
          severity: string
          source_app: string
          source_operator: string | null
          suggested_action: Json | null
          summary: string
          team_scope_id: string | null
          thread_id: string | null
          tool_call_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          acted_on?: boolean
          acted_on_at?: string | null
          agent_run_id?: string | null
          ai_call_id?: string | null
          approval_id?: string | null
          correlation_id?: string | null
          created_at?: string
          dedup_key?: string | null
          delivered?: boolean
          delivered_at?: string | null
          delivery_channel?: string | null
          dismissed?: boolean
          dismissed_at?: string | null
          evidence?: Json
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          pattern_id?: string | null
          proposal_id?: string | null
          severity: string
          source_app?: string
          source_operator?: string | null
          suggested_action?: Json | null
          summary: string
          team_scope_id?: string | null
          thread_id?: string | null
          tool_call_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          acted_on?: boolean
          acted_on_at?: string | null
          agent_run_id?: string | null
          ai_call_id?: string | null
          approval_id?: string | null
          correlation_id?: string | null
          created_at?: string
          dedup_key?: string | null
          delivered?: boolean
          delivered_at?: string | null
          delivery_channel?: string | null
          dismissed?: boolean
          dismissed_at?: string | null
          evidence?: Json
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          pattern_id?: string | null
          proposal_id?: string | null
          severity?: string
          source_app?: string
          source_operator?: string | null
          suggested_action?: Json | null
          summary?: string
          team_scope_id?: string | null
          thread_id?: string | null
          tool_call_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_insights_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_insights_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_insights_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_ledger: {
        Row: {
          account_id: string
          created_at: string | null
          detail: Json
          event_type: string
          grant_id: string | null
          id: string
          source_app: string | null
          source_operator: string | null
          target_layer: string | null
          team_scope_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          detail: Json
          event_type: string
          grant_id?: string | null
          id?: string
          source_app?: string | null
          source_operator?: string | null
          target_layer?: string | null
          team_scope_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          detail?: Json
          event_type?: string
          grant_id?: string | null
          id?: string
          source_app?: string | null
          source_operator?: string | null
          target_layer?: string | null
          team_scope_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_ledger_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_authority_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_marcus_alerts: {
        Row: {
          account_id: string
          body: string
          created_at: string | null
          delivered_via: string[] | null
          id: string
          read: boolean | null
          severity: string | null
          source_app: string | null
          title: string
          trigger_type: string
        }
        Insert: {
          account_id: string
          body: string
          created_at?: string | null
          delivered_via?: string[] | null
          id?: string
          read?: boolean | null
          severity?: string | null
          source_app?: string | null
          title: string
          trigger_type: string
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string | null
          delivered_via?: string[] | null
          id?: string
          read?: boolean | null
          severity?: string | null
          source_app?: string | null
          title?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_marcus_alerts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_marcus_follow_ups: {
        Row: {
          account_id: string
          created_at: string | null
          delivered: boolean | null
          id: string
          message: string
          scheduled_for: string
          thread_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          delivered?: boolean | null
          id?: string
          message: string
          scheduled_for: string
          thread_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          delivered?: boolean | null
          id?: string
          message?: string
          scheduled_for?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_marcus_follow_ups_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_marcus_follow_ups_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_marcus_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_marcus_messages: {
        Row: {
          channel: string | null
          content: string
          context_used: Json | null
          created_at: string | null
          extracted_actions: Json | null
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          channel?: string | null
          content: string
          context_used?: Json | null
          created_at?: string | null
          extracted_actions?: Json | null
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          channel?: string | null
          content?: string
          context_used?: Json | null
          created_at?: string | null
          extracted_actions?: Json | null
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_marcus_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_marcus_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_marcus_schedules: {
        Row: {
          account_id: string
          channel: string | null
          config: Json | null
          created_at: string | null
          enabled: boolean | null
          id: string
          last_sent_at: string | null
          next_send_at: string | null
          schedule: string
          timezone: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          channel?: string | null
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_sent_at?: string | null
          next_send_at?: string | null
          schedule: string
          timezone?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          channel?: string | null
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_sent_at?: string | null
          next_send_at?: string | null
          schedule?: string
          timezone?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_marcus_schedules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_marcus_threads: {
        Row: {
          account_id: string
          channel: string | null
          created_at: string | null
          id: string
          pinned: boolean | null
          slack_channel_id: string | null
          slack_thread_ts: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          channel?: string | null
          created_at?: string | null
          id?: string
          pinned?: boolean | null
          slack_channel_id?: string | null
          slack_thread_ts?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          channel?: string | null
          created_at?: string | null
          id?: string
          pinned?: boolean | null
          slack_channel_id?: string | null
          slack_thread_ts?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_marcus_threads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_metric_cache: {
        Row: {
          account_id: string
          created_at: string
          error_state: Json | null
          expires_at: string
          id: string
          input: Json
          normalized_input_hash: string
          provider_etag: string | null
          refreshed_at: string
          response: Json
          source: string
          stale_after_seconds: number
          team_scope_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          error_state?: Json | null
          expires_at: string
          id?: string
          input: Json
          normalized_input_hash: string
          provider_etag?: string | null
          refreshed_at?: string
          response: Json
          source: string
          stale_after_seconds: number
          team_scope_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          error_state?: Json | null
          expires_at?: string
          id?: string
          input?: Json
          normalized_input_hash?: string
          provider_etag?: string | null
          refreshed_at?: string
          response?: Json
          source?: string
          stale_after_seconds?: number
          team_scope_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_metric_cache_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_model_assignments: {
        Row: {
          approved_by: string | null
          assigned_model_id: string
          created_at: string
          family: string
          frozen: boolean
          id: string
          released_at: string | null
          role: string
          source: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          assigned_model_id: string
          created_at?: string
          family: string
          frozen?: boolean
          id?: string
          released_at?: string | null
          role: string
          source?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          assigned_model_id?: string
          created_at?: string
          family?: string
          frozen?: boolean
          id?: string
          released_at?: string | null
          role?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      kinetiks_model_flip_proposals: {
        Row: {
          approval_id: string | null
          created_at: string
          decided_at: string | null
          est_cost_delta_usd: number | null
          family: string
          from_model: string
          id: string
          reject_reason: string | null
          released_at: string | null
          role: string
          status: string
          to_model: string
        }
        Insert: {
          approval_id?: string | null
          created_at?: string
          decided_at?: string | null
          est_cost_delta_usd?: number | null
          family: string
          from_model: string
          id?: string
          reject_reason?: string | null
          released_at?: string | null
          role: string
          status?: string
          to_model: string
        }
        Update: {
          approval_id?: string | null
          created_at?: string
          decided_at?: string | null
          est_cost_delta_usd?: number | null
          family?: string
          from_model?: string
          id?: string
          reject_reason?: string | null
          released_at?: string | null
          role?: string
          status?: string
          to_model?: string
        }
        Relationships: []
      }
      kinetiks_oracle_insights: {
        Row: {
          account_id: string
          acted_on: boolean | null
          body: string
          confidence: number | null
          created_at: string | null
          delivered: boolean | null
          delivered_at: string | null
          dismissed: boolean | null
          id: string
          insight_type: string
          recommendation: string | null
          related_goals: string[] | null
          severity: string | null
          source_apps: string[] | null
          supporting_data: Json
          title: string
        }
        Insert: {
          account_id: string
          acted_on?: boolean | null
          body: string
          confidence?: number | null
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          dismissed?: boolean | null
          id?: string
          insight_type: string
          recommendation?: string | null
          related_goals?: string[] | null
          severity?: string | null
          source_apps?: string[] | null
          supporting_data?: Json
          title: string
        }
        Update: {
          account_id?: string
          acted_on?: boolean | null
          body?: string
          confidence?: number | null
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          dismissed?: boolean | null
          id?: string
          insight_type?: string
          recommendation?: string | null
          related_goals?: string[] | null
          severity?: string | null
          source_apps?: string[] | null
          supporting_data?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_oracle_insights_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_oracle_runs: {
        Row: {
          account_id: string
          ai_call_id: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_class: string | null
          error_message: string | null
          haiku_tokens_in: number | null
          haiku_tokens_out: number | null
          id: string
          insights_deduped: number
          insights_written: number
          proposals_emitted: number
          reason: string | null
          signals_by_type: Json
          signals_total: number
          source_operator: string
          sources_evaluated: string[]
          started_at: string
          status: string
          team_scope_id: string | null
        }
        Insert: {
          account_id: string
          ai_call_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          haiku_tokens_in?: number | null
          haiku_tokens_out?: number | null
          id?: string
          insights_deduped?: number
          insights_written?: number
          proposals_emitted?: number
          reason?: string | null
          signals_by_type?: Json
          signals_total?: number
          source_operator?: string
          sources_evaluated?: string[]
          started_at?: string
          status: string
          team_scope_id?: string | null
        }
        Update: {
          account_id?: string
          ai_call_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          haiku_tokens_in?: number | null
          haiku_tokens_out?: number | null
          id?: string
          insights_deduped?: number
          insights_written?: number
          proposals_emitted?: number
          reason?: string | null
          signals_by_type?: Json
          signals_total?: number
          source_operator?: string
          sources_evaluated?: string[]
          started_at?: string
          status?: string
          team_scope_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_oracle_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_pattern_library: {
        Row: {
          account_id: string
          applies_to_icp: string | null
          archived_at: string | null
          baseline_value: number | null
          confidence_score: number
          created_at: string
          decay_at: string
          declining_at: string | null
          dimensions: Json
          effective_decay_days: number
          evidence_summary: Json
          fingerprint: string
          first_observed_at: string
          id: string
          imported: boolean
          imported_from: Json | null
          last_observed_at: string
          lift_ratio: number | null
          observation_count: number
          outcome_direction: string
          outcome_metric: string
          outcome_value: number
          pattern_type: string
          sample_size: number
          source_app: string
          source_workflow_id: string | null
          status: string
          team_scope_id: string | null
          updated_at: string
          user_annotation: string | null
          user_starred: boolean
          user_suppressed: boolean
          validated_at: string | null
          variance: number | null
        }
        Insert: {
          account_id: string
          applies_to_icp?: string | null
          archived_at?: string | null
          baseline_value?: number | null
          confidence_score?: number
          created_at?: string
          decay_at: string
          declining_at?: string | null
          dimensions: Json
          effective_decay_days: number
          evidence_summary?: Json
          fingerprint: string
          first_observed_at?: string
          id?: string
          imported?: boolean
          imported_from?: Json | null
          last_observed_at?: string
          lift_ratio?: number | null
          observation_count?: number
          outcome_direction: string
          outcome_metric: string
          outcome_value: number
          pattern_type: string
          sample_size?: number
          source_app: string
          source_workflow_id?: string | null
          status?: string
          team_scope_id?: string | null
          updated_at?: string
          user_annotation?: string | null
          user_starred?: boolean
          user_suppressed?: boolean
          validated_at?: string | null
          variance?: number | null
        }
        Update: {
          account_id?: string
          applies_to_icp?: string | null
          archived_at?: string | null
          baseline_value?: number | null
          confidence_score?: number
          created_at?: string
          decay_at?: string
          declining_at?: string | null
          dimensions?: Json
          effective_decay_days?: number
          evidence_summary?: Json
          fingerprint?: string
          first_observed_at?: string
          id?: string
          imported?: boolean
          imported_from?: Json | null
          last_observed_at?: string
          lift_ratio?: number | null
          observation_count?: number
          outcome_direction?: string
          outcome_metric?: string
          outcome_value?: number
          pattern_type?: string
          sample_size?: number
          source_app?: string
          source_workflow_id?: string | null
          status?: string
          team_scope_id?: string | null
          updated_at?: string
          user_annotation?: string | null
          user_starred?: boolean
          user_suppressed?: boolean
          validated_at?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_pattern_library_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_pattern_pending_observations: {
        Row: {
          account_id: string
          closed_at: string | null
          closed_outcome_value: number | null
          created_at: string
          dimensions: Json
          id: string
          observation_key: string
          observed_at: string
          outcome_window_expires_at: string
          pattern_type: string
          status: string
          team_scope_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          closed_at?: string | null
          closed_outcome_value?: number | null
          created_at?: string
          dimensions: Json
          id?: string
          observation_key: string
          observed_at?: string
          outcome_window_expires_at: string
          pattern_type: string
          status?: string
          team_scope_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          closed_at?: string | null
          closed_outcome_value?: number | null
          created_at?: string
          dimensions?: Json
          id?: string
          observation_key?: string
          observed_at?: string
          outcome_window_expires_at?: string
          pattern_type?: string
          status?: string
          team_scope_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_pattern_pending_observations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_proposals: {
        Row: {
          account_id: string
          action: string
          confidence: string
          decline_reason: string | null
          evaluated_at: string | null
          evaluated_by: string | null
          evidence: Json | null
          expires_at: string | null
          id: string
          payload: Json
          source_app: string
          source_operator: string | null
          status: string
          submitted_at: string | null
          target_layer: string
        }
        Insert: {
          account_id: string
          action: string
          confidence: string
          decline_reason?: string | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          evidence?: Json | null
          expires_at?: string | null
          id?: string
          payload: Json
          source_app: string
          source_operator?: string | null
          status?: string
          submitted_at?: string | null
          target_layer: string
        }
        Update: {
          account_id?: string
          action?: string
          confidence?: string
          decline_reason?: string | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          evidence?: Json | null
          expires_at?: string | null
          id?: string
          payload?: Json
          source_app?: string
          source_operator?: string | null
          status?: string
          submitted_at?: string | null
          target_layer?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_proposals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_rate_limits: {
        Row: {
          id: string
          key_id: string
          request_count: number
          window_start: string
          window_type: string
        }
        Insert: {
          id?: string
          key_id: string
          request_count?: number
          window_start: string
          window_type: string
        }
        Update: {
          id?: string
          key_id?: string
          request_count?: number
          window_start?: string
          window_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_rate_limits_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_routing_events: {
        Row: {
          account_id: string
          created_at: string | null
          delivered: boolean | null
          id: string
          payload: Json
          relevance_note: string | null
          source_proposal_id: string | null
          target_app: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          delivered?: boolean | null
          id?: string
          payload: Json
          relevance_note?: string | null
          source_proposal_id?: string | null
          target_app: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          delivered?: boolean | null
          id?: string
          payload?: Json
          relevance_note?: string | null
          source_proposal_id?: string | null
          target_app?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_routing_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_routing_events_source_proposal_id_fkey"
            columns: ["source_proposal_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_sentinel_overrides: {
        Row: {
          account_id: string
          created_at: string | null
          edit_diff: string | null
          id: string
          override_type: string
          review_id: string
          user_action: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          edit_diff?: string | null
          id?: string
          override_type: string
          review_id: string
          user_action: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          edit_diff?: string | null
          id?: string
          override_type?: string
          review_id?: string
          user_action?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_sentinel_overrides_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_sentinel_overrides_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_sentinel_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_sentinel_reviews: {
        Row: {
          account_id: string
          compliance_check_result: Json | null
          contact_email: string | null
          contact_linkedin: string | null
          content: string
          content_hash: string
          content_type: string
          created_at: string | null
          fatigue_check_result: Json | null
          flags: Json | null
          id: string
          metadata: Json | null
          org_domain: string | null
          quality_score: number | null
          resolution: string | null
          resolved_at: string | null
          reviewed_at: string | null
          source_app: string
          source_operator: string | null
          verdict: string
        }
        Insert: {
          account_id: string
          compliance_check_result?: Json | null
          contact_email?: string | null
          contact_linkedin?: string | null
          content: string
          content_hash: string
          content_type: string
          created_at?: string | null
          fatigue_check_result?: Json | null
          flags?: Json | null
          id?: string
          metadata?: Json | null
          org_domain?: string | null
          quality_score?: number | null
          resolution?: string | null
          resolved_at?: string | null
          reviewed_at?: string | null
          source_app: string
          source_operator?: string | null
          verdict?: string
        }
        Update: {
          account_id?: string
          compliance_check_result?: Json | null
          contact_email?: string | null
          contact_linkedin?: string | null
          content?: string
          content_hash?: string
          content_type?: string
          created_at?: string | null
          fatigue_check_result?: Json | null
          flags?: Json | null
          id?: string
          metadata?: Json | null
          org_domain?: string | null
          quality_score?: number | null
          resolution?: string | null
          resolved_at?: string | null
          reviewed_at?: string | null
          source_app?: string
          source_operator?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_sentinel_reviews_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_social_posts: {
        Row: {
          account_id: string
          content_summary: string | null
          created_at: string
          engagement: Json
          id: string
          metadata: Json
          observed_at: string
          posted_at: string
          provider_post_id: string
          source: string
          team_scope_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          content_summary?: string | null
          created_at?: string
          engagement?: Json
          id?: string
          metadata?: Json
          observed_at?: string
          posted_at: string
          provider_post_id: string
          source: string
          team_scope_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          content_summary?: string | null
          created_at?: string
          engagement?: Json
          id?: string
          metadata?: Json
          observed_at?: string
          posted_at?: string
          provider_post_id?: string
          source?: string
          team_scope_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_social_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_synapses: {
        Row: {
          account_id: string
          activated_at: string | null
          app_name: string
          app_url: string | null
          capabilities: Json | null
          created_at: string | null
          id: string
          read_layers: string[] | null
          realtime_channel: string | null
          status: string | null
          updated_at: string | null
          write_layers: string[] | null
        }
        Insert: {
          account_id: string
          activated_at?: string | null
          app_name: string
          app_url?: string | null
          capabilities?: Json | null
          created_at?: string | null
          id?: string
          read_layers?: string[] | null
          realtime_channel?: string | null
          status?: string | null
          updated_at?: string | null
          write_layers?: string[] | null
        }
        Update: {
          account_id?: string
          activated_at?: string | null
          app_name?: string
          app_url?: string | null
          capabilities?: Json | null
          created_at?: string | null
          id?: string
          read_layers?: string[] | null
          realtime_channel?: string | null
          status?: string | null
          updated_at?: string | null
          write_layers?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_synapses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_sync_logs: {
        Row: {
          account_id: string
          arrived_at: string
          created_at: string
          duration_ms: number | null
          error_class: string | null
          error_message: string | null
          id: string
          nango_connection_id: string | null
          payload_sha256: string | null
          provider_completed_at: string | null
          records_added: number
          records_deleted: number
          records_updated: number
          source: string
          status: string
          sync_name: string
          team_scope_id: string | null
          webhook_id: string | null
        }
        Insert: {
          account_id: string
          arrived_at?: string
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          id?: string
          nango_connection_id?: string | null
          payload_sha256?: string | null
          provider_completed_at?: string | null
          records_added?: number
          records_deleted?: number
          records_updated?: number
          source: string
          status: string
          sync_name: string
          team_scope_id?: string | null
          webhook_id?: string | null
        }
        Update: {
          account_id?: string
          arrived_at?: string
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          id?: string
          nango_connection_id?: string | null
          payload_sha256?: string | null
          provider_completed_at?: string | null
          records_added?: number
          records_deleted?: number
          records_updated?: number
          source?: string
          status?: string
          sync_name?: string
          team_scope_id?: string | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_sync_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_system_identity: {
        Row: {
          account_id: string
          calendar_connected: boolean | null
          created_at: string | null
          email_address: string | null
          email_provider: string | null
          id: string
          slack_bot_user_id: string | null
          slack_channels: string[] | null
          slack_workspace_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          calendar_connected?: boolean | null
          created_at?: string | null
          email_address?: string | null
          email_provider?: string | null
          id?: string
          slack_bot_user_id?: string | null
          slack_channels?: string[] | null
          slack_workspace_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          calendar_connected?: boolean | null
          created_at?: string | null
          email_address?: string | null
          email_provider?: string | null
          id?: string
          slack_bot_user_id?: string | null
          slack_channels?: string[] | null
          slack_workspace_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_system_identity_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_thread_memory: {
        Row: {
          account_id: string
          active: boolean
          confidence: number
          content: string
          created_at: string
          id: string
          memory_type: string
          source_message_index: number | null
          superseded_by: string | null
          thread_id: string
        }
        Insert: {
          account_id: string
          active?: boolean
          confidence?: number
          content: string
          created_at?: string
          id?: string
          memory_type: string
          source_message_index?: number | null
          superseded_by?: string | null
          thread_id: string
        }
        Update: {
          account_id?: string
          active?: boolean
          confidence?: number
          content?: string
          created_at?: string
          id?: string
          memory_type?: string
          source_message_index?: number | null
          superseded_by?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_thread_memory_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_thread_memory_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "kinetiks_thread_memory"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_tool_calls: {
        Row: {
          account_id: string | null
          action_class: string | null
          agent_run_id: string | null
          approval_id: string | null
          authority_outcome: string | null
          completed_at: string | null
          correlation_id: string | null
          error_message: string | null
          grant_id: string | null
          id: string
          idempotency_key: string | null
          invoked_by_agent: string | null
          is_consequential: boolean
          latency_ms: number | null
          metadata: Json
          parent_ai_call_id: string | null
          pattern_id: string | null
          proposal_id: string | null
          started_at: string
          status: string
          team_scope_id: string | null
          thread_id: string | null
          tool_name: string
          tool_version: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          action_class?: string | null
          agent_run_id?: string | null
          approval_id?: string | null
          authority_outcome?: string | null
          completed_at?: string | null
          correlation_id?: string | null
          error_message?: string | null
          grant_id?: string | null
          id?: string
          idempotency_key?: string | null
          invoked_by_agent?: string | null
          is_consequential: boolean
          latency_ms?: number | null
          metadata?: Json
          parent_ai_call_id?: string | null
          pattern_id?: string | null
          proposal_id?: string | null
          started_at?: string
          status: string
          team_scope_id?: string | null
          thread_id?: string | null
          tool_name: string
          tool_version?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          action_class?: string | null
          agent_run_id?: string | null
          approval_id?: string | null
          authority_outcome?: string | null
          completed_at?: string | null
          correlation_id?: string | null
          error_message?: string | null
          grant_id?: string | null
          id?: string
          idempotency_key?: string | null
          invoked_by_agent?: string | null
          is_consequential?: boolean
          latency_ms?: number | null
          metadata?: Json
          parent_ai_call_id?: string | null
          pattern_id?: string | null
          proposal_id?: string | null
          started_at?: string
          status?: string
          team_scope_id?: string | null
          thread_id?: string | null
          tool_name?: string
          tool_version?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_tool_calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_tool_calls_parent_ai_call_id_fkey"
            columns: ["parent_ai_call_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_ai_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_touchpoint_ledger: {
        Row: {
          account_id: string
          action_type: string
          app: string
          channel: string
          contact_email: string | null
          contact_linkedin: string | null
          id: string
          org_domain: string | null
          sentiment: string | null
          sentinel_review_id: string | null
          timestamp: string | null
        }
        Insert: {
          account_id: string
          action_type: string
          app: string
          channel: string
          contact_email?: string | null
          contact_linkedin?: string | null
          id?: string
          org_domain?: string | null
          sentiment?: string | null
          sentinel_review_id?: string | null
          timestamp?: string | null
        }
        Update: {
          account_id?: string
          action_type?: string
          app?: string
          channel?: string
          contact_email?: string | null
          contact_linkedin?: string | null
          id?: string
          org_domain?: string | null
          sentiment?: string | null
          sentinel_review_id?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_touchpoint_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_touchpoint_ledger_sentinel_review_id_fkey"
            columns: ["sentinel_review_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_sentinel_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_user_preferences: {
        Row: {
          created_at: string
          team_scope_id: string | null
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          team_scope_id?: string | null
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          team_scope_id?: string | null
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kinetiks_webhook_deliveries: {
        Row: {
          attempt: number
          delivered_at: string
          event_type: string
          id: string
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          status_code: number | null
          success: boolean
          webhook_id: string
        }
        Insert: {
          attempt?: number
          delivered_at?: string
          event_type: string
          id?: string
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          status_code?: number | null
          success?: boolean
          webhook_id: string
        }
        Update: {
          attempt?: number
          delivered_at?: string
          event_type?: string
          id?: string
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          status_code?: number | null
          success?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_webhooks: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          events: string[]
          id: string
          is_active: boolean
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          events: string[]
          id?: string
          is_active?: boolean
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_webhooks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kinetiks_workspace_actions: {
        Row: {
          account_id: string
          action_type: string
          annotation_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          participant: string
          previous_value: Json | null
          sequence_index: number
          source_app: string
          target: string
          team_scope_id: string | null
          thread_id: string
          undone: boolean
        }
        Insert: {
          account_id: string
          action_type: string
          annotation_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          participant: string
          previous_value?: Json | null
          sequence_index: number
          source_app?: string
          target: string
          team_scope_id?: string | null
          thread_id: string
          undone?: boolean
        }
        Update: {
          account_id?: string
          action_type?: string
          annotation_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          participant?: string
          previous_value?: Json | null
          sequence_index?: number
          source_app?: string
          target?: string
          team_scope_id?: string | null
          thread_id?: string
          undone?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "kinetiks_workspace_actions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kinetiks_workspace_actions_annotation_id_fkey"
            columns: ["annotation_id"]
            isOneToOne: false
            referencedRelation: "kinetiks_annotations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _kt_apply_pattern_decay_calibration: {
        Args: {
          p_account_id: string
          p_ledger_detail: Json
          p_next_decay_at: string
          p_next_effective_decay_days: number
          p_pattern_id: string
          p_prior_effective_decay_days: number
          p_prior_updated_at: string
        }
        Returns: Json
      }
      _kt_release_advisory_lock: { Args: { p_key: string }; Returns: boolean }
      _kt_release_daily_counter: {
        Args: {
          p_account_id: string
          p_amount: number
          p_counter_key: string
          p_day: string
        }
        Returns: number
      }
      _kt_reserve_daily_counter: {
        Args: {
          p_account_id: string
          p_amount: number
          p_cap: number
          p_counter_key: string
          p_day: string
        }
        Returns: number
      }
      _kt_schedule_edge_function: {
        Args: { p_cron: string; p_function_slug: string; p_name: string }
        Returns: undefined
      }
      _kt_try_advisory_lock: { Args: { p_key: string }; Returns: boolean }
      accept_default_standing_grants: {
        Args: {
          p_account_id: string
          p_granted_by: string
          p_invocation_id: string
          p_proposals: Json
          p_proposed_by_agent: string
        }
        Returns: {
          default_origin_app: string
          default_origin_key: string
          grant_id: string
        }[]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      hv_check_suppression: {
        Args: { p_email?: string; p_kinetiks_id: string; p_phone?: string }
        Returns: boolean
      }
      hv_recalculate_lead_score: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      increment_rate_limit: {
        Args: {
          p_key_id: string
          p_window_start: string
          p_window_type: string
        }
        Returns: number
      }
      kinetiks_account_id: { Args: never; Returns: string }
      kinetiks_erase_account_ledger: {
        Args: { p_account_id: string }
        Returns: number
      }
      propose_authority_grants: {
        Args: {
          p_account_id: string
          p_granted_by: string
          p_proposals: Json
          p_proposed_by_agent: string
        }
        Returns: {
          approval_id: string
          grant_id: string
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
  public: {
    Enums: {},
  },
} as const
