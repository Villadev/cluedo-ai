import type { CaseFact, FullCase } from '../types/game.types.js';
import { describeAlibi } from './alibi-text.js';

// The engine selects the evidence and reveal schedule. The model only phrases these facts.
export function buildCaseFacts(caseData: FullCase, rounds: number): CaseFact[] {
  const facts: CaseFact[] = [];
  for (let round = 1; round <= rounds; round++) {
    const c = caseData.characters[(round - 1) % caseData.characters.length]!;
    facts.push({ id: `alibi-${round}`, revealRound: round, type: 'witness', isTrue: true,
      text: describeAlibi(c) });
    facts.push({ id: `motive-${round}`, revealRound: round, type: 'evidence', isTrue: true,
      text: `${c.name} podria tenir un motiu per cometre el crim: ${c.possibleMotive}. Això, però, no prova que sigui culpable.` });
  }
  if (rounds > 1) {
    facts.push({ id: 'forensic-initial', revealRound: 1, type: 'evidence', isTrue: true,
      text: `L’informe preliminar registra el patró de lesions de ${caseData.victim}. La comparació amb possibles armes encara està pendent.` });
  }
  facts.push({ id: 'weapon', revealRound: rounds, type: 'evidence', isTrue: true,
    text: `El perfil de les lesions de ${caseData.victim} coincideix amb el patró que deixaria ${caseData.weapon}.` });
  facts.push({ id: 'scene', revealRound: rounds, type: 'evidence', isTrue: true,
    text: `Els rastres de ${caseData.victim} a ${caseData.location} corresponen a la franja entre ${caseData.crimeWindow.start} i ${caseData.crimeWindow.end}.` });
  const killerPresence = caseData.canonicalTimeline?.presences.find(p => p.source === 'crime' && p.characterName === caseData.assassin);
  if (killerPresence && caseData.canonicalTimeline?.statements.some(st => st.characterName === caseData.assassin && st.conflictsWithTruth)) {
    facts.push({ id: 'alibi-refuted', revealRound: rounds, type: 'contradiction', isTrue: true,
      text: `La coartada declarada de ${caseData.assassin} no coincideix amb la prova material que situa aquesta persona a ${killerPresence.location} entre ${killerPresence.timeStart} i ${killerPresence.timeEnd}.` });
  }
  facts.push({ id: 'trace', revealRound: rounds, type: 'evidence', isTrue: true,
    text: `La traça material recuperada de ${caseData.weapon} coincideix exclusivament amb la mostra de ${caseData.assassin}; el registre de ${caseData.location} situa aquesta persona allí entre ${caseData.crimeWindow.start} i ${caseData.crimeWindow.end}.` });
  return facts;
}
