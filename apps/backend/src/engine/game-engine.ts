import { AIService } from '../services/AIService.js';
import { GameStoreService } from '../services/game-store.service.js';
import type {
  AccusationInput,
  AskQuestionInput,
  Clue,
  Game,
  GameSolution,
  Player,
  PublicGameView,
  PublicParticipant
} from '../types/game.types.js';
import { HttpError } from '../utils/http-error.js';
import { generateId, nowIso } from '../utils/id.js';

const MAX_PLAYERS = 17;
const MIN_PLAYERS = 2;
const WEAPONS = [
  'Eixada',
  'Pinyol de cirera',
  'Corda',
  'Foulard esplai',
  'Massa',
  'Tronc'
];
const LOCATIONS = [
  'Catalunya en Miniatura', // Parc temàtic amb maquetes de monuments de Catalunya. Secrets amagats entre les maquetes, passadissos tècnics.
  'Ajuntament de Torrelles de Llobregat', // Centre polític. Documents secrets, rivalitats entre regidors.
  'Església de Sant Martí', // Arxius antics, llegendes locals, misteris del passat.
  'Penyes de Can Riera', // Rocoses i misterioses, ideals per desaparicions o trobades secretes a l’aire lliure.
  'Ateneu Torrellenc', // Centre cultural i social del poble, lloc de reunions, intriga i conspiracions locals.
  'Plaça de l’Església', // Centre del poble, lloc de celebracions i trobades entre veïns.
  'Carrer Major', // Carrer principal amb botigues i bars, perfecte per trobades i intriga urbana.
  'Bar La Plaçá', // Bar local amb clients habituals que poden tenir informació valuosa o secrets.
  'Masia de Can Coll', // Masia històrica amb passat misteriós i documents antics amagats.
  'Font del Mas Segarra' // Font antiga amb llegendes locals, lloc ideal per pistes amagades o trobades clandestines.
];
const VICTIMS = ['Jordi Ferrer', 'Mercè Vidal', 'Magí Pons', 'Dra. Núria Soler'];

export class GameEngine {
  constructor(
    private readonly store: GameStoreService,
    private readonly aiService: AIService
  ) {}

  public async createGame(): Promise<Game> {
    const timestamp = nowIso();
    const npcCount = Math.floor(Math.random() * 3) + 4; // 4 to 6
    const npcs = await this.aiService.generateNPCs(npcCount);

    const players: Player[] = await Promise.all(
      npcs.map(async (npc) => ({
        id: generateId(),
        name: npc.name,
        description: npc.description,
        personality: npc.personality,
        publicCharacter: await this.aiService.generateCharacterProfile({ playerName: npc.name }),
        secretInfo: '',
        isKiller: false,
        isReady: true,
        isEliminated: false,
        hasAccused: false,
        askedThisRound: false,
        accusedThisRound: false,
        accusationCooldown: 0
      }))
    );

    const game: Game = {
      id: generateId(),
      state: 'LOBBY',
      players,
      murder: null,
      introNarrative: null,
      solution: null,
      clues: [],
      turns: [],
      currentTurnIndex: 0,
      roundNumber: 1,
      tensionLevel: 0,
      winnerPlayerId: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.store.save(game);
    return game;
  }

  public async startGame(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
      throw new HttpError(409, 'La partida ja ha començat');
    }

    game.state = 'READY';
    game.murder = this.generateMurder(game);
    this.assignRoles(game);

    const murderDetails = JSON.stringify({
      assassin: game.players.find((p) => p.isKiller)?.name,
      weapon: game.murder.weapon,
      location: game.murder.location,
      explanation: 'Generant...'
    });

    const [intro, explanation] = await Promise.all([
      this.aiService.generateIntroNarration(JSON.stringify(this.getPublicState(game.id))),
      this.aiService.generateCaseSolution(murderDetails)
    ]);

    game.introNarrative = intro;
    game.solution = {
      assassin: game.players.find((p) => p.isKiller)?.name || '',
      weapon: game.murder.weapon,
      location: game.murder.location,
      explanation
    };

    game.state = 'PLAYING';
    game.players = this.shuffle(game.players);
    game.currentTurnIndex = 0;
    game.roundNumber = 1;

    await this.generateCluesForRound(game);

    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async askQuestion(gameId: string, input: AskQuestionInput): Promise<{ response: string; game: Game }> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'PLAYING') {
      throw new HttpError(409, 'Les preguntes només són permeses durant la partida');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

    if (player.askedThisRound || player.accusedThisRound) {
      throw new HttpError(409, 'Ja has realitzat la teva acció en aquesta ronda');
    }

    const currentPlayer = this.getCurrentTurnPlayer(game);
    if (!currentPlayer || currentPlayer.id !== input.playerId) {
      throw new HttpError(403, 'Només pot preguntar el jugador del torn actual');
    }

    const response = await this.aiService.respondToQuestion(
      JSON.stringify(this.getPublicState(game.id, input.playerId)),
      input.question
    );

    game.turns.push({
      id: generateId(),
      playerId: player.id,
      question: input.question,
      answer: response,
      createdAt: nowIso()
    });

    player.askedThisRound = true;

    await this.nextTurn(game);
    this.store.save(game);
    return { response, game };
  }

  /**
   * Finalitza una partida en curs.
   */
  public endGame(gameId: string, winnerPlayerId?: string): Game {
    const game = this.getGameOrThrow(gameId);
    game.state = 'FINISHED';
    if (winnerPlayerId) {
      game.winnerPlayerId = winnerPlayerId;
    }
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  /**
   * Reinicia completament una partida.
   */
  public resetGame(gameId: string): Game {
    const game = this.getGameOrThrow(gameId);
    game.players = [];
    game.murder = null;
    game.introNarrative = null;
    game.clues = [];
    game.turns = [];
    game.currentTurnIndex = 0;
    game.roundNumber = 1;
    game.tensionLevel = 0;
    game.winnerPlayerId = null;
    game.state = 'LOBBY';
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  /**
   * Elimina un jugador de la partida.
   */
  public deletePlayer(gameId: string, playerId: string): Game {
    const game = this.getGameOrThrow(gameId);
    const playerIndex = game.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) {
      throw new HttpError(404, 'Jugador no trobat');
    }
    game.players.splice(playerIndex, 1);
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async handleAccusation(gameId: string, input: AccusationInput): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'PLAYING') {
      throw new HttpError(409, 'Les acusacions només són permeses durant la partida');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

    if (player.askedThisRound || player.accusedThisRound) {
      throw new HttpError(409, 'Ja has realitzat la teva acció en aquesta ronda');
    }

    if (player.accusationCooldown > 0) {
      throw new HttpError(403, `Has d'esperar ${player.accusationCooldown} rondes per tornar a acusar`);
    }

    const murder = game.murder;
    if (!murder) {
      throw new HttpError(500, 'No hi ha resolució del cas disponible');
    }

    player.accusedThisRound = true;
    const isCorrect =
      input.accusedPlayerId === murder.killerPlayerId &&
      input.weapon === murder.weapon &&
      input.location === murder.location;

    if (isCorrect) {
      game.winnerPlayerId = player.id;
      game.state = 'FINISHED';
      game.updatedAt = nowIso();
      this.store.save(game);
      return game;
    }

    // Accusation incorrect
    player.accusationCooldown = 2;

    await this.nextTurn(game);
    this.store.save(game);
    return game;
  }

  public getPublicState(gameId: string, requesterPlayerId?: string): PublicGameView {
    const game = this.getGameOrThrow(gameId);
    const currentTurnPlayer = this.getCurrentTurnPlayer(game);

    return {
      id: game.id,
      state: game.state,
      players: game.players.map((player) => ({
        id: player.id,
        name: player.name,
        description: player.description,
        personality: player.personality,
        publicCharacter: player.publicCharacter,
        isReady: player.isReady,
        isEliminated: player.isEliminated,
        hasAccused: player.hasAccused,
        askedThisRound: player.askedThisRound,
        accusedThisRound: player.accusedThisRound,
        accusationCooldown: player.accusationCooldown,
        ...(requesterPlayerId === player.id ? { secretInfo: player.secretInfo } : {}),
        ...(game.state === 'FINISHED' ? { isKiller: player.isKiller } : {})
      })),
      clues: game.clues,
      currentTurnPlayerId: currentTurnPlayer?.id ?? null,
      roundNumber: game.roundNumber,
      tensionLevel: game.tensionLevel,
      winnerPlayerId: game.winnerPlayerId,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt
    };
  }

  public getParticipants(gameId: string): PublicParticipant[] {
    const game = this.getGameOrThrow(gameId);
    return game.players.map((player) => ({
      id: player.id,
      publicCharacter: player.publicCharacter
    }));
  }

  public getInstructions(): string {
    return this.aiService.getInstructionsContext();
  }

  public getIntro(gameId: string): string {
    const game = this.getGameOrThrow(gameId);
    if (!game.introNarrative) {
      throw new HttpError(404, 'La introducció encara no està disponible');
    }
    return game.introNarrative;
  }

  public getSolution(gameId: string): GameSolution {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'FINISHED' || !game.solution) {
      throw new HttpError(409, 'La solució només està disponible quan la partida ha finalitzat');
    }

    return game.solution;
  }

  private generateMurder(game: Game): NonNullable<Game['murder']> {
    const killer = game.players[Math.floor(Math.random() * game.players.length)];
    if (!killer) {
      throw new HttpError(400, 'No es pot iniciar una partida sense jugadors');
    }

    const weapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const victim = VICTIMS[Math.floor(Math.random() * VICTIMS.length)];

    if (!weapon || !location || !victim) {
      throw new HttpError(500, 'No s’han pogut generar els detalls del crim');
    }

    return {
      killerPlayerId: killer.id,
      weapon,
      location,
      victim
    };
  }

  private assignRoles(game: Game): void {
    const murder = game.murder;
    if (!murder) {
      throw new HttpError(500, 'Cal generar el crim abans d’assignar rols');
    }

    game.players.forEach((player) => {
      player.isKiller = player.id === murder.killerPlayerId;
      player.secretInfo = player.isKiller
        ? `Ets l'assassí. Disimula qualsevol rastre relacionat amb ${murder.location}.`
        : `Has notat moviments sospitosos a prop de ${murder.location}.`;
    });
  }

  private async nextTurn(game: Game): Promise<void> {
    const allPlayersActed = game.players.every((p) => p.askedThisRound || p.accusedThisRound || p.isEliminated);

    if (allPlayersActed) {
      game.roundNumber += 1;
      game.tensionLevel = Math.min(100, game.tensionLevel + 10);

      // Reset per-round flags and update cooldowns
      game.players.forEach((p) => {
        p.askedThisRound = false;
        p.accusedThisRound = false;
        if (p.accusationCooldown > 0) {
          p.accusationCooldown -= 1;
        }
      });

      await this.generateCluesForRound(game);
      game.currentTurnIndex = 0;
    } else {
      let nextIndex = game.currentTurnIndex;
      do {
        nextIndex = (nextIndex + 1) % game.players.length;
      } while (
        game.players[nextIndex]?.isEliminated ||
        game.players[nextIndex]?.askedThisRound ||
        game.players[nextIndex]?.accusedThisRound
      );
      game.currentTurnIndex = nextIndex;
    }

    game.updatedAt = nowIso();
  }

  private async generateCluesForRound(game: Game): Promise<void> {
    const murder = game.murder;
    if (!murder) return;

    for (const player of game.players) {
      const isTrue = Math.random() < 0.7;
      let text = '';

      if (isTrue) {
        const types = ['weapon', 'location', 'killer'];
        const type = types[Math.floor(Math.random() * types.length)];
        if (type === 'weapon') text = `Sembla que l'arma utilitzada va ser ${murder.weapon}.`;
        else if (type === 'location') text = `Hi ha indicis que el crim va ocórrer a ${murder.location}.`;
        else text = `S'ha vist a algú amb aspecte de ${player.id === murder.killerPlayerId ? 'l\'assassí' : 'sospitós'} a prop.`;
      } else {
        const fakeWeapon = WEAPONS.find((w) => w !== murder.weapon) || WEAPONS[0];
        const fakeLocation = LOCATIONS.find((l) => l !== murder.location) || LOCATIONS[0];
        const fakeKiller = game.players.find((p) => p.id !== murder.killerPlayerId)?.name || 'algú';

        const types = ['weapon', 'location', 'killer'];
        const type = types[Math.floor(Math.random() * types.length)];
        if (type === 'weapon') text = `Diuen que l'arma podria ser ${fakeWeapon}.`;
        else if (type === 'location') text = `Alguns testimonis parlen de ${fakeLocation}.`;
        else text = `Es comenta que ${fakeKiller} té un comportament estrany.`;
      }

      const clue: Clue = {
        id: generateId(),
        playerId: player.id,
        text,
        isTrue,
        roundNumber: game.roundNumber,
        createdAt: nowIso()
      };
      game.clues.push(clue);
    }
  }

  private shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j] as T, newArray[i] as T];
    }
    return newArray;
  }

  private getGameOrThrow(gameId: string): Game {
    const game = this.store.getById(gameId);
    if (!game) {
      throw new HttpError(404, 'Partida no trobada');
    }
    return game;
  }

  private getPlayerOrThrow(game: Game, playerId: string): Player {
    const player = game.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new HttpError(404, 'Jugador no trobat');
    }
    return player;
  }

  private getCurrentTurnPlayer(game: Game): Player | undefined {
    return game.players[game.currentTurnIndex];
  }

  private assertActivePlayer(player: Player): void {
    if (player.isEliminated) {
      throw new HttpError(409, 'Un jugador eliminat no pot actuar');
    }
  }
}
