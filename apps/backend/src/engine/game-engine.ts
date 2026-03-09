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

  public createGame(): Game {
    const timestamp = nowIso();
    const game: Game = {
      id: generateId(),
      state: 'LOBBY',
      players: [],
      murder: null,
      introNarration: null,
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

  public async addPlayer(gameId: string, playerName: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
      throw new HttpError(409, 'No es pot unir ningú un cop la partida ha començat');
    }

    if (game.players.length >= MAX_PLAYERS) {
      throw new HttpError(400, `Màxim ${MAX_PLAYERS} jugadors`);
    }

    const player: Player = {
      id: generateId(),
      name: playerName,
      publicCharacter: await this.aiService.generateCharacterProfile({ playerName }),
      secretInfo: '',
      isKiller: false,
      isReady: false,
      isEliminated: false,
      hasAccused: false
    };

    game.players.push(player);
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async setReady(gameId: string, playerId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
      throw new HttpError(409, 'Només es pot marcar llest a la sala d’espera');
    }

    const player = game.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new HttpError(404, 'Jugador no trobat');
    }

    if (player.isEliminated) {
      throw new HttpError(409, 'Un jugador eliminat no pot actuar');
    }

    player.isReady = true;
    game.updatedAt = nowIso();

    const allReady = game.players.length >= MIN_PLAYERS && game.players.every((entry) => entry.isReady);
    if (allReady) {
      await this.startGame(game);
    }

    this.store.save(game);
    return game;
  }

  public async askQuestion(gameId: string, input: AskQuestionInput): Promise<{ response: string; game: Game }> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'IN_PROGRESS') {
      throw new HttpError(409, 'Les preguntes només són permeses durant la investigació');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

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

    this.nextTurn(game);
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
    game.introNarration = null;
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
    if (game.state !== 'ACCUSATION_PHASE') {
      throw new HttpError(409, 'Les acusacions només són permeses en fase d’acusació');
    }

    const player = this.getPlayerOrThrow(game, input.playerId);
    this.assertActivePlayer(player);

    if (player.hasAccused) {
      throw new HttpError(409, 'Aquest jugador ja ha acusat');
    }

    const murder = game.murder;
    if (!murder) {
      throw new HttpError(500, 'No hi ha resolució del cas disponible');
    }

    player.hasAccused = true;
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

    player.isEliminated = true;

    const alivePlayers = game.players.filter((entry) => !entry.isEliminated);
    if (alivePlayers.length === 1 && alivePlayers[0]?.id === murder.killerPlayerId) {
      game.winnerPlayerId = murder.killerPlayerId;
      game.state = 'FINISHED';
    }

    game.updatedAt = nowIso();
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
        publicCharacter: player.publicCharacter,
        isReady: player.isReady,
        isEliminated: player.isEliminated,
        hasAccused: player.hasAccused,
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
    if (!game.introNarration) {
      throw new HttpError(404, 'La introducció encara no està disponible');
    }
    return game.introNarration;
  }

  public getSolution(gameId: string): GameSolution {
    const game = this.getGameOrThrow(gameId);
    if (!game.murder) {
      throw new HttpError(409, 'La partida encara no té resolució');
    }

    const killer = this.getPlayerOrThrow(game, game.murder.killerPlayerId);
    return {
      assassi: killer.publicCharacter,
      arma: game.murder.weapon,
      lloc: game.murder.location
    };
  }

  private async startGame(game: Game): Promise<void> {
    game.state = 'STARTING';
    game.murder = this.generateMurder(game);
    this.assignRoles(game);
    game.introNarration = await this.aiService.generateIntroNarration(JSON.stringify(this.getPublicState(game.id)));
    game.state = 'IN_PROGRESS';
    game.currentTurnIndex = 0;
    game.roundNumber = 1;
    game.updatedAt = nowIso();
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

  private nextTurn(game: Game): void {
    const activePlayers = game.players.filter((player) => !player.isEliminated);
    if (activePlayers.length === 0) {
      throw new HttpError(500, 'No hi ha cap jugador actiu');
    }

    let nextIndex = game.currentTurnIndex;
    do {
      nextIndex = (nextIndex + 1) % game.players.length;
    } while (game.players[nextIndex]?.isEliminated);

    const wrapped = nextIndex <= game.currentTurnIndex;
    game.currentTurnIndex = nextIndex;

    if (wrapped) {
      game.roundNumber += 1;
      game.tensionLevel = Math.min(100, game.tensionLevel + 10);
      this.generateClue(game).catch(() => undefined);

      if (game.roundNumber >= 3) {
        game.state = 'ACCUSATION_PHASE';
      }
    }

    game.updatedAt = nowIso();
  }

  private async generateClue(game: Game): Promise<Clue> {
    const clueText = `Les proves indiquen que l'assassí va manipular ${game.murder?.weapon ?? 'una arma desconeguda'}.`;
    const narration = await this.aiService.generateClueNarration(
      JSON.stringify(this.getPublicState(game.id)),
      clueText
    );

    const clue: Clue = {
      id: generateId(),
      roundNumber: game.roundNumber,
      structuredClue: clueText,
      narration,
      createdAt: nowIso()
    };

    game.clues.push(clue);
    game.updatedAt = nowIso();
    return clue;
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
