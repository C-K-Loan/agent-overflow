"use client";

import { useEffect } from "react";

export function CopyCodeButton() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.classList.contains("copy-code-btn")) {
        const pre = target.closest("pre");
        if (pre) {
          const code = pre.querySelector("code")?.textContent || pre.textContent || "";
          navigator.clipboard.writeText(code).then(() => {
            target.textContent = "Copied!";
            setTimeout(() => { target.textContent = "Copy"; }, 1500);
          });
        }
      }
    }

    // Add copy buttons to all pre > code blocks
    function addButtons() {
      document.querySelectorAll("pre:not([data-copy-added])").forEach((pre) => {
        pre.setAttribute("data-copy-added", "true");
        (pre as HTMLElement).style.position = "relative";
        const btn = document.createElement("button");
        btn.textContent = "Copy";
        btn.className = "copy-code-btn absolute top-2 right-2 text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors cursor-pointer";
        pre.appendChild(btn);
      });
    }

    addButtons();
    const observer = new MutationObserver(addButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleClick);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return null;
}
