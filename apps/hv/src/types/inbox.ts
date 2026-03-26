export type ReplyClassification =
  | "interested"
  | "not_interested"
  | "bounce"
  | "ooo"
  | "referral"
  | "unclassified";

export interface InboxEmail {
  id: string;
  kinetiks_id: string;
  contact_id: string;
  subject: string;
  body: string;
  reply_body: string | null;
  reply_classification: ReplyClassification | null;
  reply_sentiment: string | null;
  replied_at: string | null;
  sent_at: string | null;
  thread_id: string | null;
  contact_name: string | null;
  created_at: string;
}
