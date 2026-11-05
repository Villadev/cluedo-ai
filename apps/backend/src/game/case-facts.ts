import type { CaseFact, FullCase } from '../types/game.types.js';

// The engine selects the evidence and reveal schedule. The model only phrases these facts.
export function buildCaseFacts(caseData: FullCase, rounds: number): CaseFact[] {
  const facts: CaseFact[] = [];
  for (let round = 1; round <= rounds; round++) {
    const c = caseData.characters[(round - 1) % caseData.characters.length]!;
    const statement = caseData.canonicalTimeline?.statements.find(st => st.characterName === c.name);
    facts.push({ id: `alibi-${round}`, revealRound: round, type: 'witness', isTrue: true,
      text: `${statement?.text ?? `${c.name} declara que era a ${c.coartada.location} de ${c.coartada.timeStart} a ${c.coartada.timeEnd}; testimoni declarat: ${c.coartada.witness}.`} És una declaració no verificada, no una confirmació independent.` });
    facts.push({ id: `motive-${round}`, revealRound: round, type: 'evidence', isTrue: true,
      text: `Motiu possible de ${c.name}: ${c.possibleMotive}. Un motiu per si sol no demostra culpabilitat.` });
  }
  facts.push({ id: 'weapon', revealRound: 1, type: 'evidence', isTrue: true,
    text: `L'informe forense identifica ${caseData.weapon} com l'arma utilitzada contra ${caseData.victim}.` });
  facts.push({ id: 'scene', revealRound: Math.max(1, Math.ceil(rounds / 2)), type: 'evidence', isTrue: true,
    text: `Els rastres de la víctima situen el crim a ${caseData.location}, entre ${caseData.crimeWindow.start} i ${caseData.crimeWindow.end}.` });
  const killerPresence = caseData.canonicalTimeline?.presences.find(p => p.source === 'crime' && p.characterName === caseData.assassin);
  if (killerPresence && caseData.canonicalTimeline?.statements.some(st => st.characterName === caseData.assassin && st.conflictsWithTruth)) {
    facts.push({ id: 'alibi-refuted', revealRound: rounds, type: 'contradiction', isTrue: true,
      text: `La coartada declarada de ${caseData.assassin} no coincideix amb la prova material que situa aquesta persona a ${killerPresence.location} entre ${killerPresence.timeStart} i ${killerPresence.timeEnd}.` });
  }
  facts.push({ id: 'trace', revealRound: rounds, type: 'evidence', isTrue: true,
    text: `La traça material recuperada de ${caseData.weapon} coincideix exclusivament amb la mostra de ${caseData.assassin}; el registre del lloc situa aquesta persona a ${caseData.location} durant el crim.` });
  return facts;
}
