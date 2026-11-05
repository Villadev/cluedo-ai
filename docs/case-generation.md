# Generació de casos — guia tècnica

Aquesta guia documenta el flux actual de `apps/backend` i els límits de la cronologia canònica. Consulteu-la abans de modificar prompts, validacions o pistes.

## Participants i NPCs

`src/engine/game-engine.ts` exigeix **2 jugadors humans** per iniciar una partida i afegeix automàticament NPCs fins a tenir almenys **4 sospitosos**. Així, 2 humans + 2 NPCs i 3 humans + 1 NPC són casos normals. Els NPCs participen en l'assignació de culpable, la generació de fitxes i les pistes.

## Pipeline

`GameEngine.startGame()` → `CaseOrchestratorService.generateCase()`:

1. `src/game/case-seed.ts`: seed determinista (culpable, víctima externa, arma, lloc, finestra del crim).
2. `AIService.generateBasicCharacters`: fitxes bàsiques per a tots els noms, inclosos NPCs.
3. `AIService.generateRelationshipMatrix`: relacions; `validateRelations` comprova els vincles.
4. `AIService.generateCasePlan`: secrets, rumors, coneixement privat i coartades; `validatePlan` comprova l'estructura i testimonis declarats.
5. Enriquiment de fitxes i normalització de personatges.
6. `buildCanonicalTimeline` (`src/game/case-validation.ts`): separa presència objectiva del culpable de declaracions no verificades.
7. `buildCaseFacts` (`src/game/case-facts.ts`): produeix pistes i les assigna a rondes. Les pistes conserven el text canònic, sense paràfrasis de la IA.
8. Narratives, pistes per ronda, revisió final i `finalizeGame`.

## Veritat versus declaracions

- **Veritat objectiva**: `FullCase.assassin`, `location`, `weapon`, `crimeWindow` i `canonicalTimeline.presences`. La presència del culpable durant el crim és un fet, no una declaració.
- **Declaracions**: `characters[].coartada` i `canonicalTimeline.statements`. Poden ser falses i tenen `verified: false`. `conflictsWithTruth: true` marca una coartada del culpable incompatible amb la seva presència real.
- **Pistes**: les coartades es presenten com a declaracions no verificades; si una coartada del culpable contradiu la veritat, una pista posterior pot refutar-la. Les evidències objectives no poden derivar-se de donar per certa una coartada.

Exemple: Oriol declara ser al bar entre 21:05 i 21:40, però la presència objectiva el situa al lloc del crim de 21:00 a 21:30. És una **mentida narrativa possible**, no necessàriament una fallada.

**Límit important:** el model actual encara **no** defineix trajectòries reals de tots els sospitosos ni esdeveniments observats per cadascú. Només fixa la presència objectiva del culpable; la resta de coartades continuen sense verificació independent. Per garantir coherència temporal global caldrà afegir esdeveniments, ubicacions, observadors i intervals per a tots els personatges.

## Errors i recuperació

L'orquestrador desa checkpoints per fase. Si canvien contractes o semàntica, cal incrementar la versió de la signatura per evitar reusar dades incompatibles. `ORCHESTRATOR_STEP_FAILURE` és un error genèric: inspeccioneu la fase, l'error original i la telemetria abans d'atribuir-lo a la revisió final. Les reparacions poden invalidar pla, pistes o narratives, però tenen un límit de reintents.

## Com validar

```bash
pnpm --filter @cluedo/backend typecheck
pnpm --filter @cluedo/backend test
pnpm --filter @cluedo/backend build
pnpm --filter @cluedo/backend test:live
```

L'última ordre fa servir generació real i pot consumir tokens d'IA; executeu-la en un entorn segur de proves. Cobriu almenys 2 humans + 2 NPCs, 3 humans + 1 NPC i 4 humans. Reviseu no només l'èxit de generació sinó també la coherència de les declaracions, la revelació de pistes i la deduïbilitat de la solució.

Fitxers clau: `src/services/case-orchestrator.service.ts`, `src/services/AIService.ts`, `src/ai/generation-contracts.ts`, `src/game/case-validation.ts`, `src/game/case-facts.ts`, `src/types/game.types.ts` i `src/tests/case-consistency.test.ts`.
