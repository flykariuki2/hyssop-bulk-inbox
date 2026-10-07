import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const root = body?.body || body;
    const payload = root?.payload || {};
    const sender = payload?.sender || {};
    const messagePayload = payload?.payload || {};

    const eventType = String(root?.type || "")
      .trim()
      .toLowerCase();

    // Ignore non-message events.
    if (eventType && eventType !== "message") {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "Not a message event",
      });
    }

    const messageId =
      String(payload?.id || payload?.messageId || "").trim() ||
      null;

    const phone =
      String(
        sender?.phone ||
          sender?.phone_number ||
          payload?.source ||
          ""
      ).trim();

    const name =
      String(sender?.name || "").trim() || null;

    const messageType =
      String(
        payload?.type ||
          messagePayload?.type ||
          "text"
      ).trim();

    const text =
      String(
        messagePayload?.text ||
          payload?.message?.text ||
          payload?.text ||
          ""
      ).trim() || null;

    const mediaUrl =
      String(
        messagePayload?.url ||
          messagePayload?.mediaUrl ||
          messagePayload?.media_url ||
          ""
      ).trim() || null;

    const caption =
      String(messagePayload?.caption || "").trim() || null;

    if (!phone) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing sender phone number.",
        },
        { status: 400 }
      );
    }

    // Ignore empty events that contain neither text nor media.
    if (!text && !mediaUrl) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "No message content",
      });
    }

    const timestamp = Number(root?.timestamp);

    const createdAt =
      Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toISOString()
        : new Date().toISOString();

    // 1. Create/update contact
    const { error: contactError } = await supabaseAdmin
      .from("contacts")
      .upsert(
        {
          phone_number: phone,
          name,
          last_message_at: createdAt,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "phone_number",
        }
      );

    if (contactError) {
      console.error("Contact upsert failed:", contactError);

      return NextResponse.json(
        {
          ok: false,
          message: "Failed to save contact.",
        },
        { status: 500 }
      );
    }

    // 2. Prevent duplicate webhook deliveries
    if (messageId) {
      const { data: existingMessage, error: lookupError } =
        await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("message_id", messageId)
          .maybeSingle();

      if (lookupError) {
        console.error(
          "Message duplicate check failed:",
          lookupError
        );
      }

      if (existingMessage) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          message_id: messageId,
        });
      }
    }

    // 3. Save inbound message
    const { error: messageError } = await supabaseAdmin
      .from("messages")
      .insert({
        phone_number: phone,
        message_text: text,
        direction: "incoming",
        status: "sent",
        message_id: messageId,
        created_at: createdAt,
        is_read: false,
        media_url: mediaUrl,
        media_type: messageType,
        caption,
      });

    if (messageError) {
      console.error(
        "Message insert failed:",
        messageError
      );

      return NextResponse.json(
        {
          ok: false,
          message: "Failed to save message.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message_id: messageId,
      phone,
    });
  } catch (error) {
    console.error("Gupshup webhook error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Webhook processing failed.",
      },
      { status: 500 }
    );
  }
}