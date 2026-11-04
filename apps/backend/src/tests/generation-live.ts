// Opt-in benchmark. This invokes the real OpenAI API and incurs usage charges.
import { AIService } from '../services/AIService.js';
import { CaseOrchestratorService } from '../services/case-orchestrator.service.js';
import { telemetryService } from '../services/telemetry.service.js';
import { env } from '../config/env.js';
import { gameFor, memoryStore } from './fixtures/generation-game.js';

async function main(): Promise<void> {
  const counts = (process.env.BENCHMARK_PLAYERS || '3,8,12,15').split(',').map(Number);
  const runs = Number(process.env.BENCHMARK_RUNS || '1');
  if (counts.some(n => !Number.isInteger(n) || n < 3 || n > 15) || !Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error('BENCHMARK_PLAYERS ha de contenir valors entre 3 i 15; BENCHMARK_RUNS, entre 1 i 10.');
  }
  const inputRate = Number(process.env.BENCHMARK_INPUT_USD_PER_MILLION);
  const outputRate = Number(process.env.BENCHMARK_OUTPUT_USD_PER_MILLION);
  const results = [];
  for (const count of counts) for (let run = 1; run <= runs; run++) {
    telemetryService.clear();
    const game = gameFor(count), store = memoryStore(game);
    const started = Date.now();
    await new CaseOrchestratorService(new AIService(), store).generateCase(game.id, 'hard', game.maxRounds);
    const result = store.getById(game.id)!;
    const telemetry = telemetryService.getForGame(game.id);
    results.push({ players: count, run, model: env.OPENAI_MODEL,
      success: result.state === 'PLAYER_INFO', error: result.generationError,
      durationMs: Date.now() - started, ...telemetry.summary,
      // Conservative estimate: all input is charged as uncached. Supply current rates explicitly.
      estimatedUsd: Number.isFinite(inputRate) && Number.isFinite(outputRate)
        ? (telemetry.summary.totalPromptTokens * inputRate + telemetry.summary.totalCompletionTokens * outputRate) / 1_000_000 : null
    });
  }
  console.log(JSON.stringify({ benchmark: results }, null, 2));
  if (results.some(r => !r.success)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
