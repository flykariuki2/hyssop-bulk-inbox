import { supabase } from "@/lib/supabase/browser";

export type MessageRecord = {
  id: string;
  phone_number: string;
  message_text: string | null;
  direction: "incoming" | "outgoing";
  status: string;
  message_id: string | null;
  created_at: string;
  is_read: boolean | null;
  media_url: string | null;
  media_type: string | null;
  media_name: string | null;
  media_mime_type: string | null;
  media_size_bytes: number | null;
  thumbnail_url: string | null;
  caption: string | null;
};

export type ContactRecord = {
  phone_number: string;
  name: string | null;
};

export async function getMessages(): Promise<MessageRecord[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      [
        "id",
        "phone_number",
        "message_text",
        "direction",
        "status",
        "message_id",
        "created_at",
        "is_read",
        "media_url",
        "media_type",
        "media_name",
        "media_mime_type",
        "media_size_bytes",
        "thumbnail_url",
        "caption",
      ].join(", ")
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load messages:", error);
    return [];
  }

  return (data ?? []) as unknown as MessageRecord[];
}

export async function getContacts(): Promise<ContactRecord[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("phone_number, name");

  if (error) {
    console.error("Failed to load contacts:", error);
    return [];
  }

  return (data ?? []) as unknown as ContactRecord[];
}