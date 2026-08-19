import React from 'react';
import { OnboardingStepper } from './ui/sign-up';

interface Props {
  onComplete: (data: { cloudflareAccountId: string; cloudflareApiKey: string; groqKey: string }) => void;
  onGoogleSignIn: () => Promise<void>;
  userProfile: { displayName?: string; avatarUrl?: string } | null;
}

export function OnboardingPage({ onComplete, onGoogleSignIn, userProfile }: Props) {
  return (
    <div className="absolute inset-0 z-[9999] flex flex-col w-full h-full items-center justify-center p-6 bg-zinc-50/90 backdrop-blur-sm">
      <OnboardingStepper 
        onComplete={onComplete}
        onGoogleSignIn={onGoogleSignIn}
        userProfile={userProfile}
      />
    </div>
  );
}
