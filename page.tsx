import WebcamProcessorNeural from "@/components/WebcamProcessorNeural";
import GlobeScene from "@/components/GlobeScene";
import HUD from "@/components/HUD";
import HandUI from "@/components/HandUI";
import Link from "next/link";
import NeuralScene from "@/components/NeuralScene";
import { ArrowLeft } from "lucide-react";

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden ">
      {/* Background: Webcam Feed */}
      <WebcamProcessorNeural />

      {/* Middle Layer:  NeuralScene  */}
      <NeuralScene />

      {/* 3. Hand Interactions Layer */}
       <HandUI />

      {/* Navigation Buttons */}
    <div className="absolute bottom-10 right-10 z-50 flex flex-col gap-4 items-end">
        
      </div>
      <div className="absolute top-6 right-6 z-50 text-right pointer-events-none">
        <h1 className="text-2xl font-bold text-white tracking-widest opacity-80 font-mono text-glow">
          MAGICAL_INTERFACE
        </h1>
        <p className="text-cyan-400 text-xs mt-1 tracking-[0.3em] opacity-70">
          Edited by: Rajveer Khanvilkar
        </p>
      </div>
    </main>
  );
}
