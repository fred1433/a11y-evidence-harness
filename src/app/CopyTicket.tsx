"use client";

import { useState } from "react";

export default function CopyTicket({ text, label = "Copy ticket" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 2200);
      }}
      className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-1 text-[13px] font-medium text-ink transition-colors hover:border-ink/35 hover:bg-black/[0.03]"
    >
      <span aria-hidden="true" className="text-muted">
        {done ? "✓" : "⧉"}
      </span>
      {done ? "Copied" : label}
      <span className="sr-only"> to the clipboard</span>
    </button>
  );
}
