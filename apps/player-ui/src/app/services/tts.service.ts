import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TtsService {
  private readonly isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private readonly currentlyPlayingId = signal<string | null>(null);

  readonly isTtsSupported = this.isSupported;
  readonly playingId = this.currentlyPlayingId.asReadonly();

  speak(id: string, text: string): void {
    if (!this.isSupported) return;

    this.stop();

    // Small delay for immersion
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ca-ES';
      utterance.pitch = 0.85;
      utterance.rate = 0.95;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang === 'ca-ES') ||
                             voices.find(v => v.lang.startsWith('es'));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        this.currentlyPlayingId.set(id);
      };

      utterance.onend = () => {
        this.currentlyPlayingId.set(null);
        this.currentUtterance = null;
      };

      utterance.onerror = () => {
        this.currentlyPlayingId.set(null);
        this.currentUtterance = null;
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    }, 200);
  }

  stop(): void {
    if (!this.isSupported) return;
    window.speechSynthesis.cancel();
    this.currentlyPlayingId.set(null);
    this.currentUtterance = null;
  }
}
