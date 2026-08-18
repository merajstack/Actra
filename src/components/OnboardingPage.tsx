import React from 'react';
import { OnboardingStepper } from './OnboardingStepper';

interface Props {
  onComplete: (data: { displayName: string; primaryKey: string; secondaryKey: string }) => void;
  onGoogleSignIn: () => Promise<void>;
}

export function OnboardingPage({ onComplete, onGoogleSignIn }: Props) {
  return (
    <div className="absolute inset-0 z-[9999] flex flex-col w-full h-full items-center justify-center p-6 bg-zinc-50/90 backdrop-blur-sm">
      <OnboardingStepper 
        onComplete={onComplete}
        onGoogleSignIn={onGoogleSignIn}
      />
    </div>
  );
}
