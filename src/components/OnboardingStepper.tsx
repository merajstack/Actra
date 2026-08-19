"use client";

import { useState } from "react";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Brain, Key, Globe, Shield } from "lucide-react";

const TOTAL_STEPS = 3;

interface OnboardingProps {
  onComplete: (data: { cloudflareAccountId: string; cloudflareApiKey: string; groqKey: string }) => void;
  onGoogleSignIn: () => Promise<void>;
  userProfile: { displayName?: string; avatarUrl?: string } | null;
}

export function OnboardingStepper({ onComplete, onGoogleSignIn, userProfile }: OnboardingProps) {
  const [current, setCurrent] = useState(1);
  const [cloudflareAccountId, setCloudflareAccountId] = useState("");
  const [cloudflareApiKey, setCloudflareApiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  const progressPct = ((current - 1) / (TOTAL_STEPS - 1)) * 100;

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await onGoogleSignIn();
      setCurrent(2);
    } catch (err) {
      console.error("Google sign in failed", err);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleNext = () => {
    if (current === 1) {
      if (!userProfile) {
        handleGoogleSignIn();
        return;
      }
      setCurrent(2);
    } else if (current === 2) {
      setCurrent(3);
    } else if (current === 3) {
      onComplete({ cloudflareAccountId, cloudflareApiKey, groqKey });
    }
  };

  const isNextDisabled = () => {
    if (current === 1 && !userProfile) return true;
    if (current === 2 && (!cloudflareAccountId.trim() || !cloudflareApiKey.trim())) return true;
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
      <div className="min-h-[160px] flex flex-col justify-center">
        {current === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 text-center">
            <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <Globe className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg text-zinc-900">Connect Google Workspace</h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Sign in with Google to enable Actra AI to securely access your emails, schedule events, and organize files.
              </p>
            </div>
            
            {userProfile ? (
              <div className="bg-zinc-50 rounded-xl p-4 flex items-center justify-center space-x-3 border border-zinc-200 mt-4 max-w-xs mx-auto animate-in zoom-in-95 duration-300">
                {userProfile.avatarUrl ? (
                  <img src={userProfile.avatarUrl} className="w-10 h-10 rounded-full" alt="Avatar" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 font-semibold">
                    {userProfile.displayName?.[0] || 'G'}
                  </div>
                )}
                <div className="text-left">
                  <p className="text-sm font-medium text-zinc-900 font-semibold">Connected</p>
                  <p className="text-xs text-zinc-500">{userProfile.displayName}</p>
                </div>
              </div>
            ) : (
              <Button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="mt-4 inline-flex items-center space-x-2 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 font-medium py-2 px-4 rounded-lg shadow-sm transition duration-150 ease-in-out cursor-pointer mx-auto"
              >
                {isSigningIn ? (
                  <span>Connecting...</span>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.6c-.28 1.5-1.11 2.76-2.39 3.62v3h3.86c2.26-2.09 3.67-5.17 3.67-8.45z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.86-3c-1.08.72-2.45 1.16-4.1 1.16-3.15 0-5.81-2.13-6.76-5.01H1.28v3.13C3.26 21.31 7.27 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.24 14.24c-.25-.72-.39-1.5-.39-2.3s.14-1.58.39-2.3V6.51H1.28C.46 8.15 0 9.98 0 12s.46 3.85 1.28 5.49l3.96-3.25z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.97 1.19 15.24 0 12 0 7.27 0 3.26 2.69 1.28 6.51l3.96 3.25c.95-2.88 3.61-5.01 6.76-5.01z"/>
                    </svg>
                    <span>Connect Google</span>
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {current === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <Globe className="w-4 h-4 text-orange-500 animate-pulse" /> Cloudflare Credentials <span className="text-xs text-orange-500 font-normal">(Important)</span>
              </label>
              <p className="text-xs text-zinc-500">Required to run the default fast visual reasoning model.</p>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Account ID</span>
                <Input 
                  placeholder="Cloudflare Account ID" 
                  value={cloudflareAccountId}
                  onChange={(e) => setCloudflareAccountId(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">API Token</span>
                <Input 
                  type="password"
                  placeholder="Cloudflare API Token" 
                  value={cloudflareApiKey}
                  onChange={(e) => setCloudflareApiKey(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {current === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <Key className="w-4 h-4 text-zinc-400" /> Groq API Key <span className="text-xs text-zinc-400 font-normal">(Optional Fallback)</span>
              </label>
              <p className="text-xs text-zinc-500">Provides backup model routing if primary services are rate-limited or offline.</p>
            </div>
            <Input 
              type="password"
              placeholder="gsk_..." 
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              autoFocus
            />
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
            ? "Finish" 
            : current === 1 && !userProfile 
              ? "Connect Google" 
              : "Next"}
        </Button>
      </div>
    </div>
  );
}
