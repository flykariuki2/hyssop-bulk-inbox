"use client";

import Link from "next/link";
import { useState } from "react";

type PreviewSample = {
  phone_number: string | number;
  name: string;
  params: string[];
};

type PreviewResult = {
  ok?: boolean;
  message?: string;
  totalRows?: number;
  selectedParamColumns?: string[];
  sampleMessages?: PreviewSample[];
};

type SendResult = {
  ok?: boolean;
  message?: string;
  [key: string]: unknown;
};

export default function BulkSendPage() {
  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [language, setLanguage] = useState("en");
  const [param1, setParam1] = useState("");
  const [param2, setParam2] = useState("");
  const [param3, setParam3] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] =
  useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] =
  useState<SendResult | null>(null);

  async function handlePreview() {
  try {
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewResult(null);

    const response = await fetch("/api/bulk-send-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sheetId,
        sheetName,
        templateName,
        language,
        param1,
        param2,
        param3,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      setPreviewError(data.message || "Preview request failed.");
      return;
    }

    setPreviewResult(data);
  } catch (error) {
    console.error("Preview error:", error);
    setPreviewError("Preview request failed.");
  } finally {
    setPreviewLoading(false);
  }
}

async function handleSend() {
  try {
    setSendLoading(true);
    setSendResult(null);

    const response = await fetch("/api/bulk-send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sheetId,
        sheetName,
        templateName,
        language,
        param1,
        param2,
        param3,
      }),
    });

    const data = await response.json();
    setSendResult(data);
  } catch (error) {
    console.error("Send error:", error);
    setSendResult({
      ok: false,
      message: "Bulk send request failed.",
    });
  } finally {
    setSendLoading(false);
  }
}

  return (
    <main className="min-h-screen bg-[#020b2d] text-white px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold tracking-tight">Bulk Messaging</h1>
    <p className="mt-2 text-sm text-blue-100/70">
      Send approved WhatsApp templates to contacts from Google Sheets.
    </p>
  </div>

  <Link
    href="/inbox"
    className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
  >
    ← Back to Inbox
  </Link>
</div>

        <div className="space-y-6">
          {/* Source */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
            <h2 className="text-xl font-semibold">1. Message Source</h2>
            <p className="mt-1 text-sm text-blue-100/70">
              Enter the Google Sheet details that contain the contacts.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Google Sheet ID
                </label>
                <input
                  type="text"
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
                  placeholder="Enter Google Sheet ID"
                  className="w-full rounded-xl border border-white/10 bg-[#08153f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Sheet Tab Name
                </label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="e.g. Sheet1"
                  className="w-full rounded-xl border border-white/10 bg-[#08153f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </div>
            </div>
          </section>

          {/* Template */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
            <h2 className="text-xl font-semibold">2. Template</h2>
            <p className="mt-1 text-sm text-blue-100/70">
              Choose the approved WhatsApp template details.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Template Name / ID
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. event_invite_2"
                  className="w-full rounded-xl border border-white/10 bg-[#08153f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Language
                </label>
                <input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                  className="w-full rounded-xl border border-white/10 bg-[#08153f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </div>
            </div>
          </section>

          {/* Params */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
            <h2 className="text-xl font-semibold">3. Parameter Mapping</h2>
            <p className="mt-1 text-sm text-blue-100/70">
              Enter the Google Sheets column names to use for template
              variables.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Param 1 Column
                </label>
                <input
                  type="text"
                  value={param1}
                  onChange={(e) => setParam1(e.target.value)}
                  placeholder="e.g. name"
                  className="w-full rounded-xl border border-white/10 bg-[#08153f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Param 2 Column
                </label>
                <input
                  type="text"
                  value={param2}
                  onChange={(e) => setParam2(e.target.value)}
                  placeholder="e.g. project_interest"
                  className="w-full rounded-xl border border-white/10 bg-[#08153f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Param 3 Column
                </label>
                <input
                  type="text"
                  value={param3}
                  onChange={(e) => setParam3(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-white/10 bg-[#08153f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </div>
            </div>
          </section>

          {/* Actions */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
            <h2 className="text-xl font-semibold">4. Actions</h2>
            <p className="mt-1 text-sm text-blue-100/70">
              Preview and send will be wired in the next steps.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
  type="button"
  onClick={handlePreview}
  className="rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15"
>
  {previewLoading ? "Previewing..." : "Preview Contacts"}
</button>

              <button
  type="button"
  onClick={handleSend}
  className="rounded-xl bg-[#00c27a] px-5 py-3 text-sm font-semibold text-[#021224] transition hover:opacity-90"
>
  {sendLoading ? "Sending..." : "Send Bulk Messages"}
</button>
            </div>
            {previewError ? (
  <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
    {previewError}
  </div>
) : null}

{previewResult ? (
  <div className="mt-4 rounded-xl border border-white/10 bg-[#08153f] p-4 text-sm text-blue-100/90">
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-xs text-blue-100/60">Total Rows</div>
        <div className="mt-1 text-lg font-semibold">
          {previewResult.totalRows ?? 0}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 p-3 md:col-span-2">
        <div className="text-xs text-blue-100/60">Selected Param Columns</div>
        <div className="mt-1 text-sm">
          {previewResult.selectedParamColumns?.length
            ? previewResult.selectedParamColumns.join(", ")
            : "None selected"}
        </div>
      </div>
    </div>

    <div className="mt-4">
      <h3 className="text-sm font-semibold text-white">Sample Messages</h3>

      {previewResult.sampleMessages?.length ? (
        <div className="mt-3 space-y-3">
          {previewResult.sampleMessages.map(
            (
              item: {
                phone_number: string | number;
                name: string;
                params: string[];
              },
              index: number
            ) => (
              <div
                key={index}
                className="rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="text-sm font-medium text-white">
                  {item.name || "No name"}
                </div>
                <div className="text-xs text-blue-100/60">
                  {item.phone_number || "No phone number"}
                </div>
                <div className="mt-2 text-xs text-blue-100/80">
                  Params: {item.params?.length ? item.params.join(" | ") : "None"}
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="mt-3 text-sm text-blue-100/70">
          No sample messages available.
        </div>
      )}
    </div>
  </div>
) : null}

{sendResult ? (
  <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
    <div className="font-semibold">
      {sendResult.ok ? "Send completed" : "Send failed"}
    </div>

    {sendResult.message ? (
      <div className="mt-1 text-sm text-emerald-100/90">
        {sendResult.message}
      </div>
    ) : null}

    <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-[#08153f] p-3 text-xs text-blue-100/90">
      {JSON.stringify(sendResult, null, 2)}
    </pre>
  </div>
) : null}
          </section>
        </div>
      </div>
    </main>
  );
}