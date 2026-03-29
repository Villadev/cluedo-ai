import { Injectable, signal, NgZone, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SpeechToTextService {
  private readonly ngZone = inject(NgZone);
  private recognition: any;
  private readonly _isListening = signal(false);
  private readonly _transcript = signal('');
  private readonly _isSupported = signal(false);

  readonly isListening = this._isListening.asReadonly();
  readonly transcript = this._transcript.asReadonly();
  readonly isSupported = this._isSupported.asReadonly();

  constructor() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this._isSupported.set(true);
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'ca-ES';
      this.recognition.interimResults = true;
      this.recognition.continuous = false;

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            this.ngZone.run(() => {
              this._transcript.set(event.results[i][0].transcript);
            });
          } else {
            interimTranscript += event.results[i][0].transcript;
            this.ngZone.run(() => {
              this._transcript.set(interimTranscript);
            });
          }
        }
      };

      this.recognition.onstart = () => {
        this.ngZone.run(() => this._isListening.set(true));
      };

      this.recognition.onend = () => {
        this.ngZone.run(() => this._isListening.set(false));
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        this.ngZone.run(() => this._isListening.set(false));
      };
    }
  }

  start(): void {
    if (!this.recognition || this.isListening()) return;
    this._transcript.set('');
    try {
      this.recognition.start();
    } catch (error) {
      console.error('Failed to start speech recognition', error);
    }
  }

  stop(): void {
    if (!this.recognition || !this.isListening()) return;
    this.recognition.stop();
  }
}
