"use client";

import { useEffect, useState } from "react";

type Props = {
  code: string;
  language?: string;
};

export function CodeBlock({ code, language = "solidity" }: Props) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const out = await codeToHtml(code, {
          lang: language === "solidity" ? "js" : language,
          theme: "github-dark",
        });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html) {
    return (
      <div
        className="code-block no-select [&_pre]:m-0 [&_pre]:bg-transparent! [&_code]:font-[family-name:var(--font-mono)]"
        dangerouslySetInnerHTML={{ __html: html }}
        aria-label="Code sample"
      />
    );
  }

  return (
    <pre className="code-block no-select" aria-label="Code sample">
      <code>{code}</code>
    </pre>
  );
}
