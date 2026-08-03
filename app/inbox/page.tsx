"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { groupMessagesByPhone } from "@/lib/messages/groupMessages";
import { getContacts, getMessages } from "@/lib/messages/queries";
import { supabase } from "@/lib/supabase/browser";

type Message = {
  id: string;
  phone_number: string;
  message_text: string | null;
  direction: "incoming" | "outgoing";
  status: string;
  message_id?: string | null;
  created_at: string;
  is_read: boolean | null;
  media_url?: string | null;
  media_type?: string | null;
  media_name?: string | null;
  media_mime_type?: string | null;
  media_size_bytes?: number | null;
  thumbnail_url?: string | null;
  caption?: string | null;
};

type Contact = {
  phone_number: string;
  name: string | null;
};

type FilterType = "all" | "unread" | "expired";
type OutgoingMediaType = "image" | "file";

function formatTime(dateString?: string) {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateString?: string) {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelativeDay(dateString?: string) {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();

  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return formatDate(dateString);
}

function formatFileSize(size?: number | null) {
  if (!size || size <= 0) return "";

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isConversationExpired(messages: Message[]) {
  const latestInbound = [...messages]
    .filter((message) => message.direction === "incoming")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )[0];

  if (!latestInbound) return true;

  const lastInboundTime = new Date(latestInbound.created_at).getTime();
  const hours24 = 24 * 60 * 60 * 1000;

  return Date.now() - lastInboundTime > hours24;
}

function getMessagePreview(message?: Message) {
  if (!message) return "No messages";

  const text =
    message.caption?.trim() ||
    message.message_text?.trim();

  if (text) return text;

  if (message.media_type === "image") {
    return "📷 Photo";
  }

  if (message.media_type === "video") {
    return "🎥 Video";
  }

  if (message.media_type === "audio") {
    return "🎵 Audio";
  }

  if (message.media_url) {
    return `📎 ${message.media_name || "Attachment"}`;
  }

  return "No message content";
}

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [deletingConversation, setDeletingConversation] =
    useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<
    string | null
  >(null);

  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshMessages() {
    const [messagesData, contactsData] = await Promise.all([
      getMessages(),
      getContacts(),
    ]);

    setMessages(messagesData);
    setContacts(contactsData);
  }

  async function uploadAttachment(file: File, phone: string) {
    const extension = file.name.split(".").pop() || "file";

    const safeName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .slice(0, 60);

    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2)}-${safeName}.${extension}`;

    const safePhone = phone.replace(/[^0-9]/g, "");
    const filePath = `${safePhone}/${fileName}`;

    const { error } = await supabase.storage
      .from("attachments")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (error) {
      console.error("Attachment upload error:", error);
      throw new Error("Attachment upload failed.");
    }

    const { data } = supabase.storage
      .from("attachments")
      .getPublicUrl(filePath);

    if (!data.publicUrl) {
      throw new Error("Attachment URL was not generated.");
    }

    return data.publicUrl;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        await refreshMessages();
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          void refreshMessages();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const conversations = useMemo(() => {
    const visibleMessages = messages.filter((message) => {
      const hasPhone = Boolean(message.phone_number?.trim());

      const hasContent = Boolean(
        message.message_text?.trim() ||
          message.caption?.trim() ||
          message.media_url?.trim()
      );

      return hasPhone && hasContent;
    });

    return groupMessagesByPhone(visibleMessages);
  }, [messages]);

  const contactMap = useMemo(() => {
    const map: Record<string, string> = {};

    contacts.forEach((contact) => {
      const phone = contact.phone_number?.trim();
      const name = contact.name?.trim();

      if (phone && name) {
        map[phone] = name;
      }
    });

    return map;
  }, [contacts]);

  const conversationMeta = useMemo(() => {
    return Object.keys(conversations).map((phone) => {
      const conversation = conversations[phone] || [];
      const lastMessage = conversation.at(-1);
      const expired = isConversationExpired(conversation);

      const unreadCount = conversation.filter(
        (message) =>
          message.direction === "incoming" && !message.is_read
      ).length;

      return {
        phone,
        conversation,
        lastMessage,
        expired,
        unreadCount,
        displayName: contactMap[phone] || phone,
      };
    });
  }, [conversations, contactMap]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();

    return conversationMeta
      .filter(
        ({
          phone,
          displayName,
          lastMessage,
          unreadCount,
          expired,
        }) => {
          const lastMessagePreview =
            getMessagePreview(lastMessage).toLowerCase();

          const matchesSearch =
            !term ||
            phone.toLowerCase().includes(term) ||
            displayName.toLowerCase().includes(term) ||
            lastMessagePreview.includes(term);

          if (!matchesSearch) return false;

          if (filter === "unread") {
            return unreadCount > 0;
          }

          if (filter === "expired") {
            return expired;
          }

          return true;
        }
      )
      .sort((a, b) => {
        const aTime = new Date(
          a.lastMessage?.created_at || 0
        ).getTime();

        const bTime = new Date(
          b.lastMessage?.created_at || 0
        ).getTime();

        return bTime - aTime;
      });
  }, [conversationMeta, filter, search]);

  useEffect(() => {
    const allPhones = conversationMeta.map(
      (conversation) => conversation.phone
    );

    const timeout = window.setTimeout(() => {
      if (
        !selectedPhone &&
        filter === "all" &&
        allPhones.length > 0
      ) {
        setSelectedPhone(allPhones[0]);
        return;
      }

      if (
        selectedPhone &&
        !allPhones.includes(selectedPhone)
      ) {
        setSelectedPhone(allPhones[0] || null);
        setMobileChatOpen(false);
      }
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [conversationMeta, selectedPhone, filter]);

  const activeMessages = useMemo(() => {
    if (!selectedPhone) return [];

    return [...(conversations[selectedPhone] || [])].sort(
      (a, b) =>
        new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime()
    );
  }, [selectedPhone, conversations]);

  const activeConversationExpired = useMemo(() => {
    if (!selectedPhone) return true;

    return isConversationExpired(
      conversations[selectedPhone] || []
    );
  }, [selectedPhone, conversations]);

  const activeDisplayName = selectedPhone
    ? contactMap[selectedPhone] || selectedPhone
    : "Select a conversation";

  useEffect(() => {
    if (!selectedPhone) return;

    const timeout = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    }, 50);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [selectedPhone, activeMessages.length, mobileChatOpen]);

  useEffect(() => {
    if (!selectedPhone) return;

    const unreadIncoming = (
      conversations[selectedPhone] || []
    ).filter(
      (message) =>
        message.direction === "incoming" && !message.is_read
    );

    if (unreadIncoming.length === 0) return;

    const unreadIds = unreadIncoming.map(
      (message) => message.id
    );

    void supabase
      .from("messages")
      .update({ is_read: true })
      .in("id", unreadIds)
      .then(({ error }) => {
        if (error) {
          console.error(
            "Failed to mark messages as read:",
            error
          );

          void refreshMessages();
          return;
        }

        setMessages((previousMessages) =>
          previousMessages.map((message) =>
            unreadIds.includes(message.id)
              ? {
                  ...message,
                  is_read: true,
                }
              : message
          )
        );
      });
  }, [selectedPhone, conversations]);

  function handleAttachmentChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0] || null;

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      setSendError(
        "Only JPG, PNG, WEBP and PDF files are currently supported."
      );

      event.target.value = "";
      return;
    }

    const maxSizeMb = 25;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      setSendError(
        `Attachment must be ${maxSizeMb} MB or smaller.`
      );

      event.target.value = "";
      return;
    }

    setAttachment(file);
    setSendError("");
  }

  async function handleSend() {
    if (
      !selectedPhone ||
      (!draft.trim() && !attachment) ||
      isSending ||
      activeConversationExpired
    ) {
      return;
    }

    const originalDraft = draft;
    const originalAttachment = attachment;
    const messageText = draft.trim();

    let mediaUrl: string | null = null;
    let mediaType: OutgoingMediaType | null = null;

    if (originalAttachment) {
      try {
        mediaUrl = await uploadAttachment(
          originalAttachment,
          selectedPhone
        );

        mediaType = originalAttachment.type.startsWith("image/")
          ? "image"
          : "file";
      } catch (error) {
        console.error(error);
        setSendError("Failed to upload attachment.");
        return;
      }
    }

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      phone_number: selectedPhone,
      message_text: messageText || null,
      direction: "outgoing",
      status: "sending",
      created_at: new Date().toISOString(),
      is_read: true,
      media_url: mediaUrl,
      media_type: mediaType,
      media_name: originalAttachment?.name || null,
      media_mime_type: originalAttachment?.type || null,
      media_size_bytes: originalAttachment?.size || null,
      caption: messageText || null,
    };

    setMessages((previousMessages) => [
      ...previousMessages,
      tempMessage,
    ]);

    setDraft("");
    setAttachment(null);
    setIsSending(true);
    setSendError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    try {
      const response = await fetch(
        "https://promptlyai.app.n8n.cloud/webhook/send-message",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: selectedPhone,
            phone_number: selectedPhone,
            message: messageText,
            mediaUrl,
            mediaType,
            mediaName: originalAttachment?.name || null,
            mediaMimeType: originalAttachment?.type || null,
            mediaSizeBytes: originalAttachment?.size || null,
            caption: messageText || null,
          }),
        }
      );

      if (!response.ok) {
        const responseText = await response.text();

        throw new Error(
          responseText || "Message failed to send."
        );
      }

      await refreshMessages();
    } catch (error) {
      console.error(error);

      setMessages((previousMessages) =>
        previousMessages.filter(
          (message) => message.id !== tempMessage.id
        )
      );

      setDraft(originalDraft);
      setAttachment(originalAttachment);
      setSendError("Message failed to send.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    const confirmed = window.confirm(
      "Delete this message?"
    );

    if (!confirmed) return;

    setDeletingMessageId(messageId);

    try {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId);

      if (error) throw error;

      setMessages((previousMessages) =>
        previousMessages.filter(
          (message) => message.id !== messageId
        )
      );
    } catch (error) {
      console.error(error);
      window.alert("Failed to delete message.");
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function handleDeleteConversation() {
    if (!selectedPhone) return;

    const confirmed = window.confirm(
      `Delete the entire conversation for ${activeDisplayName}?`
    );

    if (!confirmed) return;

    setDeletingConversation(true);

    try {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("phone_number", selectedPhone);

      if (error) throw error;

      setMessages((previousMessages) =>
        previousMessages.filter(
          (message) =>
            message.phone_number !== selectedPhone
        )
      );

      setSelectedPhone(null);
      setMobileChatOpen(false);
    } catch (error) {
      console.error(error);
      window.alert("Failed to delete conversation.");
    } finally {
      setDeletingConversation(false);
    }
  }

  function openChat(phone: string) {
    setSelectedPhone(phone);
    setMobileChatOpen(true);
  }

  function closeMobileChat() {
    setMobileChatOpen(false);
  }

  function renderMessageMedia(message: Message) {
    if (!message.media_url) return null;

    const mediaType = message.media_type?.toLowerCase();
    const mimeType =
      message.media_mime_type?.toLowerCase() || "";

    const isImage =
      mediaType === "image" ||
      mimeType.startsWith("image/");

    const isVideo =
      mediaType === "video" ||
      mimeType.startsWith("video/");

    const isAudio =
      mediaType === "audio" ||
      mimeType.startsWith("audio/");

    if (isImage) {
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noreferrer"
          className="mb-2 block overflow-hidden rounded-xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.media_url}
            alt={message.media_name || "WhatsApp attachment"}
            className="max-h-[420px] w-full rounded-xl object-cover"
          />
        </a>
      );
    }

    if (isVideo) {
      return (
        <video
          src={message.media_url}
          controls
          preload="metadata"
          className="mb-2 max-h-[420px] w-full rounded-xl bg-black"
        >
          Your browser does not support video playback.
        </video>
      );
    }

    if (isAudio) {
      return (
        <audio
          src={message.media_url}
          controls
          preload="metadata"
          className="mb-2 w-full"
        >
          Your browser does not support audio playback.
        </audio>
      );
    }

    return (
      <a
        href={message.media_url}
        target="_blank"
        rel="noreferrer"
        className="mb-2 flex items-center gap-3 rounded-xl border border-black/10 bg-black/10 px-3 py-3 transition hover:bg-black/15"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/10 text-xl">
          📄
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {message.media_name || "Open attachment"}
          </div>

          <div className="mt-0.5 text-xs opacity-70">
            {message.media_mime_type || "Document"}
            {message.media_size_bytes
              ? ` • ${formatFileSize(
                  message.media_size_bytes
                )}`
              : ""}
          </div>
        </div>
      </a>
    );
  }

  const sidebar = (
    <aside className="flex h-full w-full flex-col bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="text-xl font-semibold tracking-tight text-white">
          Hyssop Bulk Inbox
        </div>

        <div className="mt-1 text-sm text-slate-400">
          WhatsApp conversations
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href="/inbox/bulk-send"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm font-medium text-emerald-300"
          >
            Bulk Send
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          >
            Sign out
          </button>
        </div>

        <div className="mt-4">
          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search chats..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-slate-500"
          />
        </div>

        <div className="mt-3 flex gap-2">
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["expired", "Expired"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                filter === value
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-800 text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-slate-400">
            Loading chats...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">
            No conversations found.
          </div>
        ) : (
          filteredConversations.map(
            ({
              phone,
              displayName,
              lastMessage,
              unreadCount,
              expired,
            }) => {
              const active = selectedPhone === phone;
              const hasSavedName = displayName !== phone;

              return (
                <button
                  key={phone}
                  type="button"
                  onClick={() => openChat(phone)}
                  className={`flex w-full items-start gap-3 border-b border-slate-800 px-4 py-4 text-left transition ${
                    active
                      ? "bg-slate-900"
                      : "hover:bg-slate-900/70"
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-300">
                    WA
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">
                          {displayName}
                        </div>

                        {hasSavedName && (
                          <div className="truncate text-xs text-slate-500">
                            {phone}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-xs text-slate-500">
                        {formatTime(
                          lastMessage?.created_at
                        )}
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="truncate text-sm text-slate-400">
                        {getMessagePreview(lastMessage)}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {expired && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                            Expired
                          </span>
                        )}

                        {unreadCount > 0 &&
                          selectedPhone !== phone && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-slate-950">
                              {unreadCount}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            }
          )
        )}
      </div>
    </aside>
  );

  const chatPanel = (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={closeMobileChat}
            className="rounded-full bg-slate-800 px-3 py-1.5 text-sm text-slate-300 md:hidden"
          >
            Back
          </button>

          <div className="min-w-0">
            <div className="truncate font-semibold text-white">
              {activeDisplayName}
            </div>

            {selectedPhone && (
              <>
                <div className="mt-1 truncate text-xs text-slate-500">
                  {selectedPhone}
                </div>

                <div
                  className={`mt-1 text-xs ${
                    activeConversationExpired
                      ? "text-amber-300"
                      : "text-emerald-300"
                  }`}
                >
                  {activeConversationExpired
                    ? "Reply window expired"
                    : "Reply window active"}
                </div>
              </>
            )}
          </div>
        </div>

        {selectedPhone && (
          <button
            type="button"
            onClick={handleDeleteConversation}
            disabled={deletingConversation}
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 disabled:opacity-50"
          >
            {deletingConversation
              ? "Deleting..."
              : "Delete chat"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scroll-smooth bg-[linear-gradient(180deg,rgba(2,6,23,1)_0%,rgba(15,23,42,1)_100%)] px-4 py-4 pb-28 md:px-6 md:py-6 md:pb-6">
        {!selectedPhone ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            Select a chat to view messages.
          </div>
        ) : activeMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            No messages in this conversation.
          </div>
        ) : (
          <div className="space-y-3">
            {activeMessages.map((message, index) => {
              const isIncoming =
                message.direction === "incoming";

              const previousMessage =
                activeMessages[index - 1];

              const showDayLabel =
                !previousMessage ||
                formatRelativeDay(
                  previousMessage.created_at
                ) !==
                  formatRelativeDay(
                    message.created_at
                  );

              const displayedText =
                message.caption?.trim() ||
                message.message_text?.trim() ||
                "";

              return (
                <div key={message.id}>
                  {showDayLabel && (
                    <div className="mb-3 flex justify-center">
                      <div className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                        {formatRelativeDay(
                          message.created_at
                        )}
                      </div>
                    </div>
                  )}

                  <div
                    className={`group flex ${
                      isIncoming
                        ? "justify-start"
                        : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3 py-3 shadow-lg md:max-w-[70%] ${
                        isIncoming
                          ? "rounded-bl-md bg-slate-800 text-white"
                          : "rounded-br-md bg-emerald-500 text-slate-950"
                      }`}
                    >
                      {renderMessageMedia(message)}

                      {displayedText && (
                        <div className="whitespace-pre-wrap break-words px-1 text-sm leading-6">
                          {displayedText}
                        </div>
                      )}

                      <div
                        className={`mt-2 flex items-center justify-end gap-2 px-1 text-[11px] ${
                          isIncoming
                            ? "text-slate-400"
                            : "text-slate-900/70"
                        }`}
                      >
                        <span>
                          {formatTime(
                            message.created_at
                          )}
                        </span>

                        {!isIncoming && message.status && (
                          <span>
                            • {message.status}
                          </span>
                        )}

                        {!String(message.id).startsWith(
                          "temp-"
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteMessage(
                                message.id
                              )
                            }
                            disabled={
                              deletingMessageId ===
                              message.id
                            }
                            className={`rounded px-1.5 py-0.5 ${
                              isIncoming
                                ? "bg-slate-700 text-slate-300"
                                : "bg-emerald-600/30 text-slate-900"
                            }`}
                          >
                            {deletingMessageId ===
                            message.id
                              ? "..."
                              : "Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 p-3 backdrop-blur md:p-4">
        {sendError && (
          <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {sendError}
          </div>
        )}

        {selectedPhone &&
          activeConversationExpired && (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              This chat is expired. You can only reply
              after the customer sends a new message.
            </div>
          )}

        {attachment && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {attachment.name}
              </div>

              <div className="mt-0.5 text-xs text-emerald-300/70">
                {formatFileSize(attachment.size)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setAttachment(null);

                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              className="shrink-0 rounded-lg bg-emerald-500/20 px-2 py-1 text-xs text-emerald-100"
            >
              Remove
            </button>
          </div>
        )}

        <div className="flex items-end gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={handleAttachmentChange}
          />

          <button
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={
              !selectedPhone ||
              isSending ||
              activeConversationExpired
            }
            className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="Attach file"
          >
            📎
          </button>

          <textarea
            value={draft}
            onChange={(event) =>
              setDraft(event.target.value)
            }
            placeholder={
              !selectedPhone
                ? "Select a chat first..."
                : activeConversationExpired
                  ? "Reply window expired"
                  : attachment
                    ? "Add an optional caption..."
                    : "Type a message..."
            }
            disabled={
              !selectedPhone ||
              isSending ||
              activeConversationExpired
            }
            rows={1}
            className="max-h-32 min-h-[48px] flex-1 resize-y rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-base text-white shadow-inner outline-none placeholder:text-slate-400 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 md:max-h-40 md:text-sm"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              !selectedPhone ||
              (!draft.trim() && !attachment) ||
              isSending ||
              activeConversationExpired
            }
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <div className="h-screen bg-slate-950 text-white">
      <div className="mx-auto h-full max-w-[1600px] overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="hidden h-full md:flex">
          <div className="w-[380px] border-r border-slate-800">
            {sidebar}
          </div>

          {chatPanel}
        </div>

        <div className="h-full md:hidden">
          {!mobileChatOpen ? sidebar : chatPanel}
        </div>
      </div>
    </div>
  );
}