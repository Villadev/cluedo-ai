import { GenerationTelemetry, GenerationTelemetryEvent, GenerationTelemetrySummary } from '../types/game.types.js';

class TelemetryService {
  private events: GenerationTelemetryEvent[] = [];
  private readonly MAX_EVENTS = 1000;
  private gameTotalTimes: Map<string, number> = new Map();

  public record(event: GenerationTelemetryEvent): void {
    this.events.push(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.shift();
    }
    console.log(`[TELEMETRY] ${event.stepLabel} (${event.attempt}) - ${event.outcome} (${event.durationMs}ms) for game ${event.gameId}`);
  }

  public setTotalTime(gameId: string, ms: number): void {
    this.gameTotalTimes.set(gameId, ms);
  }

  public getForGame(gameId: string): GenerationTelemetry {
    const gameEvents = this.events.filter(e => e.gameId === gameId);
    return {
      events: gameEvents,
      summary: this.calculateSummary(gameEvents),
      totalTimeMs: this.gameTotalTimes.get(gameId)
    };
  }

  private calculateSummary(events: GenerationTelemetryEvent[]): GenerationTelemetrySummary {
    const totalCalls = events.length;
    const durations = events.map(e => e.durationMs).sort((a, b) => a - b);
    const avgDurationMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const p95DurationMs = durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] || 0 : 0;

    return {
      totalCalls: new Set(events.map(e => e.stepLabel)).size,
      totalAttempts: events.length,
      avgDurationMs,
      p95DurationMs,
      totalValidationFailed: events.filter(e => e.outcome === 'validation_failed').length,
      totalAborted: events.filter(e => e.outcome === 'aborted').length,
      totalTimeouts: events.filter(e => e.outcome === 'timeout').length,
      totalErrors: events.filter(e => e.outcome === 'error').length,
      totalPromptTokens: events.reduce((acc, e) => acc + (e.usage?.prompt_tokens || 0), 0),
      totalCompletionTokens: events.reduce((acc, e) => acc + (e.usage?.completion_tokens || 0), 0),
      totalTokens: events.reduce((acc, e) => acc + (e.usage?.total_tokens || 0), 0)
    };
  }

  public clear(): void {
    this.events = [];
    this.gameTotalTimes.clear();
  }
}

export const telemetryService = new TelemetryService();
