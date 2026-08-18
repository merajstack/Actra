"use client";

import { useState } from "react";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Brain, User, Key, Globe } from "lucide-react";

const TOTAL_STEPS = 4;

interface OnboardingProps {
  onComplete: (data: { displayName: string; primaryKey: string; secondaryKey: string }) => void;
  onGoogleSignIn: () => Promise<void>;
}

export function OnboardingStepper({ onComplete, onGoogleSignIn }: OnboardingProps) {
  const [current, setCurrent] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [primaryKey, setPrimaryKey] = useState("");
  const [secondaryKey, setSecondaryKey] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  const progressPct = ((current - 1) / (TOTAL_STEPS - 1)) * 100;

  const handleNext = async () => {
    if (current === TOTAL_STEPS) {
      setIsSigningIn(true);
      try {
        await onGoogleSignIn();
        onComplete({ displayName, primaryKey, secondaryKey });
      } catch (err) {
        console.error("Google sign in failed", err);
        setIsSigningIn(false);
      }
    } else {
      setCurrent((c) => Math.min(TOTAL_STEPS, c + 1));
    }
  };

  const isNextDisabled = () => {
    if (current === 1 && !displayName.trim()) return true;
    if (current === 2 && !primaryKey.trim()) return true;
    return false;
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-4">
          <Brain className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Welcome to Actra</h2>
        <p className="text-sm text-zinc-500">Let's get your browser set up</p>
      </div>

      {/* progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>Step {current} of {TOTAL_STEPS}</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <Progress
          value={progressPct}
          className="h-1.5"
        />
      </div>

      {/* Step Content */}
      <div className="min-h-[120px] flex flex-col justify-center">
        {current === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <User className="w-4 h-4" /> Display Name
              </label>
              <p className="text-xs text-zinc-500">What should we call you?</p>
            </div>
            <Input 
              placeholder="e.g. Alex" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {current === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <Key className="w-4 h-4" /> Groq API Key <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-zinc-500">Required for core AI features.</p>
            </div>
            <Input 
              type="password"
              placeholder="gsk_..." 
              value={primaryKey}
              onChange={(e) => setPrimaryKey(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {current === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <Key className="w-4 h-4 text-zinc-400" /> Secondary Groq API Key (Optional)
              </label>
              <p className="text-xs text-zinc-500">Used as a fallback if you hit rate limits.</p>
            </div>
            <Input 
              type="password"
              placeholder="gsk_..." 
              value={secondaryKey}
              onChange={(e) => setSecondaryKey(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {current === 4 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 text-center">
            <div className="mx-auto w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-zinc-900">Connect Google Workspace</h3>
              <p className="text-sm text-zinc-500">Enable AI to read your emails and manage calendar events.</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={() => setCurrent((c) => Math.max(1, c - 1))}
          disabled={current === 1 || isSigningIn}
        >
          Back
        </Button>
        <Button
          size="sm"
          className="cursor-pointer bg-orange-500 text-white hover:bg-orange-600 border-transparent px-6"
          onClick={handleNext}
          disabled={isNextDisabled() || isSigningIn}
        >
          {current === TOTAL_STEPS 
            ? (isSigningIn ? "Signing in..." : "Connect Google & Finish") 
            : "Next"}
        </Button>
      </div>
    </div>
  );
}
