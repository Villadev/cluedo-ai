import { Router, Request, Response } from 'express';
import { GameController } from '../controllers/game.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

const gameRouter = Router();
const controller = new GameController();

/**
 * @openapi
 * /game:
 *   post:
 *     summary: Crear una nova partida
 *     description: Inicialitza una nova instància de joc i retorna l'estat inicial.
 *     responses:
 *       200:
 *         description: Partida creada correctament.
 */
gameRouter.post('/', asyncHandler((req: Request, res: Response) => controller.createGame(req, res)));

/**
 * @openapi
 * /game/{id}/join:
 *   post:
 *     summary: Unir-se a una partida
 *     description: Afegeix un nou jugador a la sala d'espera d'una partida existent.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nom del jugador (mínim 2 caràcters)
 *     responses:
 *       200:
 *         description: Jugador unit correctament.
 */
gameRouter.post('/:id/join', asyncHandler((req: Request, res: Response) => controller.joinGame(req, res)));

/**
 * @openapi
 * /game/{id}/start:
 *   post:
 *     summary: Iniciar generació del cas
 *     description: Tanca la sala d'espera i comença la generació IA del misteri i els personatges.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Inici de generació del cas confirmat.
 */
gameRouter.post('/:id/start', asyncHandler((req: Request, res: Response) => controller.startGame(req, res)));

/**
 * @openapi
 * /game/{id}/play:
 *   post:
 *     summary: Començar a jugar
 *     description: Canvia l'estat de la partida a PLAYING per permetre l'inici dels torns.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Partida iniciada correctament.
 */
gameRouter.post('/:id/play', asyncHandler((req: Request, res: Response) => controller.startPlaying(req, res)));

/**
 * @openapi
 * /game/{id}/ask:
 *   post:
 *     summary: Fer una pregunta
 *     description: Envia una pregunta d'investigació al mestre del joc (IA).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - playerId
 *               - question
 *             properties:
 *               playerId:
 *                 type: string
 *                 format: uuid
 *               question:
 *                 type: string
 *     responses:
 *       200:
 *         description: Resposta del mestre del joc obtinguda.
 */
gameRouter.post('/:id/ask', asyncHandler((req: Request, res: Response) => controller.ask(req, res)));

/**
 * @openapi
 * /game/{id}/accuse:
 *   post:
 *     summary: Realitzar una acusació
 *     description: Un jugador intenta resoldre el cas acusant un sospitós amb una arma i lloc concrets.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               playerId:
 *                 type: string
 *                 format: uuid
 *               accusedPlayerId:
 *                 type: string
 *                 format: uuid
 *               weapon:
 *                 type: string
 *               location:
 *                 type: string
 *     responses:
 *       200:
 *         description: Resultat de l'acusació processat.
 */
gameRouter.post('/:id/accuse', asyncHandler((req: Request, res: Response) => controller.accuse(req, res)));

/**
 * @openapi
 * /game/{id}/players:
 *   get:
 *     summary: Obtenir participants
 *     description: Retorna una llista resumida dels participants de la partida.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Llista de participants obtinguda.
 */
gameRouter.get('/:id/players', asyncHandler((req: Request, res: Response) => controller.getPlayers(req, res)));

/**
 * @openapi
 * /game/{id}/instructions:
 *   get:
 *     summary: Obtenir instruccions
 *     description: Retorna les instruccions detallades del joc.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Instruccions obtingudes en format text.
 */
gameRouter.get('/:id/instructions', asyncHandler((req: Request, res: Response) => controller.getInstructions(req, res)));

/**
 * @openapi
 * /game/{id}/solution:
 *   get:
 *     summary: Obtenir la solució
 *     description: Retorna la solució del cas.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Solució de la partida.
 */
gameRouter.get('/:id/solution', asyncHandler((req: Request, res: Response) => controller.getSolution(req, res)));

/**
 * @openapi
 * /game/{id}/intro:
 *   get:
 *     summary: Obtenir la introducció
 *     description: Retorna la narrativa inicial de la partida.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Narrativa inicial.
 */
gameRouter.get('/:id/intro', asyncHandler((req: Request, res: Response) => controller.getIntro(req, res)));

/**
 * @openapi
 * /game/{id}/clues/round/{roundNumber}:
 *   get:
 *     summary: Obtenir pistes per ronda
 *     description: Retorna les pistes generades per a una ronda específica.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: roundNumber
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Llista de pistes de la ronda.
 */
gameRouter.get('/:id/clues/round/:roundNumber', asyncHandler((req: Request, res: Response) => controller.getCluesByRound(req, res)));

/**
 * @openapi
 * /game/{id}/players/{playerId}/secret:
 *   get:
 *     summary: Obtenir secret del jugador
 *     description: Retorna la informació secreta assignada a un jugador.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Secret del jugador.
 */
gameRouter.get('/:id/players/:playerId/secret', asyncHandler((req: Request, res: Response) => controller.getPlayerSecret(req, res)));

/**
 * @openapi
 * /game/{id}/timeline/log:
 *   post:
 *     summary: Registrar esdeveniment al timeline
 *     description: Permet a la UI registrar esdeveniments personalitzats com TTS_PLAYED.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Event registrat correctament.
 */
gameRouter.post('/:id/timeline/log', asyncHandler((req: Request, res: Response) => controller.logTimelineEvent(req, res)));

/**
 * @openapi
 * /game/{id}/debug:
 *   get:
 *     summary: Obtenir dades de depuració
 *     description: Retorna l'estat complet de la partida per a fins de depuració.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Dades de depuració obtingudes.
 */
gameRouter.get('/:id/debug', asyncHandler((req: Request, res: Response) => controller.debug(req, res)));

/**
 * @openapi
 * /game/{id}/timeline:
 *   get:
 *     summary: Obtenir historial d'esdeveniments
 *     description: Retorna una llista cronològica de tots els esdeveniments de la partida.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Historial d'esdeveniments obtingut.
 */
gameRouter.get('/:id/timeline', asyncHandler((req: Request, res: Response) => controller.timeline(req, res)));

/**
 * @openapi
 * /game/{id}/chat:
 *   get:
 *     summary: Obtenir historial del xat
 *     description: Retorna tots els missatges enviats al xat.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Historial del xat obtingut.
 */
gameRouter.get('/:id/chat', asyncHandler((req: Request, res: Response) => controller.getChat(req, res)));

/**
 * @openapi
 * /game/{id}/questions:
 *   get:
 *     summary: Obtenir historial de preguntes
 *     description: Retorna totes les preguntes realitzades pels jugadors.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Historial de preguntes obtingut.
 */
gameRouter.get('/:id/questions', asyncHandler((req: Request, res: Response) => controller.getQuestions(req, res)));

/**
 * @openapi
 * /game/{id}/state:
 *   get:
 *     summary: Obtenir informació resumida de l'estat
 *     description: Retorna l'estat actual, nombre de jugadors, personatges i ronda.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Estat de la partida obtingut.
 */
gameRouter.get('/:id/state', asyncHandler((req: Request, res: Response) => controller.getState(req, res)));

/**
 * @openapi
 * /game/{id}:
 *   get:
 *     summary: Obtenir estat de la partida
 *     description: Retorna l'estat públic actual d'una partida.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *       - in: query
 *         name: playerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del jugador que fa la petició (opcional)
 *     responses:
 *       200:
 *         description: Estat de la partida obtingut.
 */
gameRouter.get('/:id', asyncHandler((req: Request, res: Response) => controller.getGame(req, res)));

/**
 * @openapi
 * /game/{id}/end:
 *   post:
 *     summary: Finalitzar partida
 *     description: Finalitza una partida en curs i estableix un guanyador opcionalment.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               winnerPlayerId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Partida finalitzada correctament.
 */
gameRouter.post('/:id/end', asyncHandler((req: Request, res: Response) => controller.endGame(req, res)));

/**
 * @openapi
 * /game/{id}/reset:
 *   post:
 *     summary: Reiniciar partida
 *     description: Reinicia completament la partida, eliminant jugadors i esborrant l'historial.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Partida reiniciada correctament.
 */
gameRouter.post('/:id/reset', asyncHandler((req: Request, res: Response) => controller.resetGame(req, res)));

/**
 * @openapi
 * /game/{id}/users:
 *   get:
 *     summary: Llistar jugadors
 *     description: Retorna la llista detallada dels jugadors (ID i nom) a la partida.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *     responses:
 *       200:
 *         description: Llista de jugadors obtinguda.
 */
gameRouter.get('/:id/users', asyncHandler((req: Request, res: Response) => controller.getUsers(req, res)));

/**
 * @openapi
 * /game/{id}/users/{userId}:
 *   delete:
 *     summary: Eliminar jugador
 *     description: Elimina un jugador específic de la partida.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la partida
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del jugador a eliminar
 *     responses:
 *       200:
 *         description: Jugador eliminat correctament.
 */
gameRouter.delete('/:id/users/:userId', asyncHandler((req: Request, res: Response) => controller.deleteUser(req, res)));

export { gameRouter };
