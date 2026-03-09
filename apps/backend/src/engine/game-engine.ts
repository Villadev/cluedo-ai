import { AIService } from '../services/AIService.js';
import { GameStoreService } from '../services/game-store.service.js';
import type {
  AccusationInput,
  AskQuestionInput,
  Clue,
  Game,
  GameSolution,
  Player,
  Character,
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
  'Catalunya en Miniatura',
  'Ajuntament de Torrelles de Llobregat',
  'Església de Sant Martí',
  'Penyes de Can Riera',
  'Ateneu Torrellenc',
  'Plaça de l’Església',
  'Carrer Major',
  'Bar La Plaçá',
  'Masia de Can Coll',
  'Font del Mas Segarra'
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
      characters: [],
      assassinCharacterId: null,
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

  public addPlayer(gameId: string, nickname: string): Game {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
      throw new HttpError(409, 'Només es poden unir jugadors durant la sala d\'espera');
    }

    const player: Player = {
      id: generateId(),
      nickname,
      characterId: null,
      isReady: true,
      isEliminated: false,
      hasAccused: false,
      askedThisRound: false,
      accusedThisRound: false,
      accusationCooldown: 0
    };

    game.players.push(player);
    game.updatedAt = nowIso();
    this.store.save(game);
    return game;
  }

  public async startGame(gameId: string): Promise<Game> {
    const game = this.getGameOrThrow(gameId);
    if (game.state !== 'LOBBY') {
      throw new HttpError(409, 'La partida ja ha començat');
    }

    if (game.players.length < 2) {
      throw new HttpError(400, 'Es necessiten almenys 2 jugadors per començar');
    }

    game.state = 'READY';

    // Generar personatges automàticament
    const npcs = await this.aiService.generateNPCs(game.players.length);
    game.characters = npcs.map((npc) => ({
      id: generateId(),
      name: npc.name,
      description: npc.description,
      personality: npc.personality,
      secrets: 'Secret per defecte',
      isAssassin: false
    }));

    // Seleccionar assassí aleatòriament
    const assassinIndex = Math.floor(Math.random() * game.characters.length);
    const assassin = game.characters[assassinIndex];
    if (assassin) {
      assassin.isAssassin = true;
      game.assassinCharacterId = assassin.id;
    }

    // Assignar personatges als jugadors
    const shuffledCharacters = this.shuffle(game.characters);
    game.players.forEach((player, index) => {
      player.characterId = shuffledCharacters[index]?.id || null;
    });

    game.murder = this.generateMurder(game);

    const murderDetails = JSON.stringify({
      assassin: game.characters.find((c) => c.isAssassin)?.name,
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
      assassin: game.characters.find((c) => c.isAssassin)?.name || '',
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

  public resetGame(gameId: string): Game {
    const game = this.getGameOrThrow(gameId);
    game.players = [];
    game.characters = [];
    game.assassinCharacterId = null;
    game.murder = null;
    game.introNarrative = null;
    game.solution = null;
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

    const accusedPlayer = this.getPlayerOrThrow(game, input.accusedPlayerId);
    const accusedCharacterId = accusedPlayer.characterId;

    player.accusedThisRound = true;
    const isCorrect =
      accusedCharacterId === game.assassinCharacterId &&
      input.weapon === murder.weapon &&
      input.location === murder.location;

    if (isCorrect) {
      game.winnerPlayerId = player.id;
      game.state = 'FINISHED';
      game.updatedAt = nowIso();
      this.store.save(game);
      return game;
    }

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
      players: game.players.map((player) => {
        const character = game.characters.find((c) => c.id === player.characterId);
        const publicCharacter = character ? {
          id: character.id,
          name: character.name,
          description: character.description,
          personality: character.personality
        } : undefined;

        return {
          id: player.id,
          nickname: player.nickname,
          character: publicCharacter,
          isReady: player.isReady,
          isEliminated: player.isEliminated,
          hasAccused: player.hasAccused,
          askedThisRound: player.askedThisRound,
          accusedThisRound: player.accusedThisRound,
          accusationCooldown: player.accusationCooldown
        };
      }),
      clues: game.clues.map(c => ({
        id: c.id,
        playerId: c.playerId,
        text: c.text,
        roundNumber: c.roundNumber,
        createdAt: c.createdAt
      })),
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
    return game.players.map((player) => {
      const character = game.characters.find((c) => c.id === player.characterId);
      return {
        id: player.id,
        publicCharacter: character ? character.description : 'Sospitós'
      };
    });
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
    if (!game.assassinCharacterId) {
      throw new HttpError(500, 'No hi ha assassí assignat');
    }

    const killerPlayer = game.players.find((p) => p.characterId === game.assassinCharacterId);
    if (!killerPlayer) {
      throw new HttpError(500, 'No s\'ha trobat el jugador assassí');
    }

    const weapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const victim = VICTIMS[Math.floor(Math.random() * VICTIMS.length)];

    if (!weapon || !location || !victim) {
      throw new HttpError(500, 'No s’han pogut generar els detalls del crim');
    }

    return {
      killerPlayerId: killerPlayer.id,
      weapon,
      location,
      victim
    };
  }

  private async nextTurn(game: Game): Promise<void> {
    const allPlayersActed = game.players.every((p) => p.askedThisRound || p.accusedThisRound || p.isEliminated);

    if (allPlayersActed) {
      game.roundNumber += 1;
      game.tensionLevel = Math.min(100, game.tensionLevel + 10);

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
        else text = `S'ha vist a algú amb aspecte de ${player.characterId === game.assassinCharacterId ? 'l\'assassí' : 'sospitós'} a prop.`;
      } else {
        const fakeWeapon = WEAPONS.find((w) => w !== murder.weapon) || WEAPONS[0];
        const fakeLocation = LOCATIONS.find((l) => l !== murder.location) || LOCATIONS[0];
        const fakeKillerCharacter = game.characters.find((c) => c.id !== game.assassinCharacterId);
        const fakeKillerName = fakeKillerCharacter ? fakeKillerCharacter.name : 'algú';

        const types = ['weapon', 'location', 'killer'];
        const type = types[Math.floor(Math.random() * types.length)];
        if (type === 'weapon') text = `Diuen que l'arma podria ser ${fakeWeapon}.`;
        else if (type === 'location') text = `Alguns testimonis parlen de ${fakeLocation}.`;
        else text = `Es comenta que ${fakeKillerName} té un comportament estrany.`;
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
