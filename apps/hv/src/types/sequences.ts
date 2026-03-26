export type SequenceStatus = "draft" | "active" | "paused" | "archived";

export interface SequenceStep {
  id: string;
  type: "email" | "delay" | "condition";
  order: number;
  // Email step fields
  subject_line?: string;
  template?: string;
  style_preset_id?: string;
  // Delay step fields
  delay_days?: number;
  delay_hours?: number;
  // Condition step fields
  condition_type?: "replied" | "opened" | "clicked" | "bounced";
  condition_action?: "skip" | "stop" | "branch";
}

export interface HvSequence {
  id: string;
  kinetiks_id: string;
  name: string;
  steps: SequenceStep[];
  status: SequenceStatus;
  stats: {
    enrolled?: number;
    completed?: number;
    replied?: number;
    bounced?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface SequenceFilters {
  status?: SequenceStatus;
  q?: string;
}
