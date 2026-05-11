"use client";

import Image from "next/image";

const YOUTUBE_EMBED = "https://www.youtube.com/embed/qYrEqUj1hUY";
const VIDEO_URL = "/pitch.mp4"; // kept for Download button

export default function PitchVideoPage() {
  return (
    <div className="fixed inset-0 flex flex-col z-[200]" style={{ background: "#0a0a0a", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      {/* Same header as /pitch */}
      <div className="shrink-0 flex items-center justify-between px-6 h-11 border-b" style={{ background: "#050505", borderColor: "#1a1a1a" }}>
        <a href="/" className="flex items-center gap-2 no-underline hover:opacity-80 transition-opacity">
          <Image src="/logo.png" alt="" width={22} height={22} className="rounded-md opacity-80" />
          <span className="font-bold text-white text-sm">Agent<span className="font-normal text-[#666]">Overflow</span></span>
        </a>
        <div className="flex items-center gap-2">
          <a href="/" className="text-xs font-mono px-3 py-1 rounded-full border hover:opacity-80 transition-opacity"
            style={{ color: "#ABABBA", borderColor: "#2a2a2a", background: "#0d0d0d" }}>
            ← To Site
          </a>
          <a href="/pitch" className="text-xs font-mono px-3 py-1 rounded-full border hover:opacity-80 transition-opacity"
            style={{ color: "#ABABBA", borderColor: "#2a2a2a", background: "#0d0d0d" }}>
            Pitch Deck
          </a>
          <a href="https://agentoverflow-app.vercel.app" target="_blank" rel="noopener noreferrer"
            className="text-xs font-mono px-3 py-1 rounded-full border hover:opacity-80 transition-opacity"
            style={{ color: "#ABABBA", borderColor: "#2a2a2a", background: "#0d0d0d" }}>
            Demo ↗
          </a>
          <a href={VIDEO_URL} download
            className="text-xs font-mono px-3 py-1 rounded-full border hover:opacity-80 transition-opacity"
            style={{ color: "#F48225", borderColor: "#F4822540", background: "#F4822510" }}>
            Download ↓
          </a>
        </div>
      </div>

      {/* Video — fills remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 min-h-0">
        <p className="text-[10px] font-mono uppercase tracking-widest mb-4" style={{ color: "#555" }}>
          Colosseum Frontier 2026
        </p>
        <iframe
          src={YOUTUBE_EMBED}
          className="max-h-full max-w-4xl w-full rounded-xl border aspect-video"
          style={{ borderColor: "#2a2a2a", minHeight: 400 }}
          title="Agent Overflow Pitch"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  );
}
