"use client";

import CameraView from "@/components/CameraView";
import { Camera } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* Top Navbar Header Bar */}
      <header className="h-16 px-4 md:px-8 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between shrink-0 z-30 backdrop-blur-md">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <img 
            src="/logo.svg" 
            alt="Potretku Studio Foto Logo" 
            className="h-10 w-auto object-contain drop-shadow-sm"
          />
        </div>

        {/* Live Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="hidden md:inline font-semibold">Studio Active</span>
        </div>

      </header>

      {/* Main Fullscreen Workspace Area */}
      <div className="flex-1 relative overflow-hidden bg-zinc-950 flex flex-col p-2 sm:p-4 md:p-6">
        <CameraView />
      </div>

    </main>
  );
}
