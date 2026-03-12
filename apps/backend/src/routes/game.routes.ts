import { Router } from 'express';
import { GameController } from '../controllers/game.controller.js';

const gameRouter = Router();
const controller = new GameController();

/**
 * Encapsula la gestió d'errors per a les rutes asíncrones.
 */
const asyncHandler = (fn: (req: any, res: any, next: any) => Promise<any>) => (req: any, res: any, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @openapi
 * /game:
 *   post:
 *     summary: Crear una nova partida
 *     description: Inicialitza una nova partida en estat LOBBY.
 *     responses:
 *       200:
 *         description: Partida creada correctament.
 */
gameRouter.post('/', asyncHandler((req, res) => controller.createGame(req, res)));

/**
 * @openapi
 * /game/{id}/join:
 *   post:
 *     summary: Unir-se a una partida
 *     description: Permet a un nou jugador entrar a la sala d'espera.
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
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Jugador unit correctament.
 */
gameRouter.post('/:id/join', asyncHandler((req, res) => controller.joinGame(req, res)));

/**
 * @openapi
 * /game/{id}/start:
 *   post:
 *     summary: Generar cas i començar preparatius
 *     description: Genera el cas mitjançant IA i posa la partida en estat READY.
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
 *         description: Cas generat correctament.
 */
gameRouter.post('/:id/start', asyncHandler((req, res) => controller.startGame(req, res)));

/**
 * @openapi
 * /game/{id}/play:
 *   post:
 *     summary: Començar a jugar la partida
 *     description: Passa la partida d'estat READY a PLAYING.
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
 *         description: Partida en joc.
 */
gameRouter.post('/:id/play', asyncHandler((req, res) => controller.startPlaying(req, res)));

/**
 * @openapi
 * /game/{id}/ask:
 *   post:
 *     summary: Fer una pregunta
 *     description: El jugador del torn actual fa una pregunta al Mestre del Joc.
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
 *               question:
 *                 type: string
 *     responses:
 *       200:
 *         description: Resposta generada correctament.
 */
gameRouter.post('/:id/ask', asyncHandler((req, res) => controller.ask(req, res)));

/**
 * @openapi
 * /game/{id}/accuse:
 *   post:
 *     summary: Realitzar una acusació
 *     description: Un jugador intenta resoldre el cas acusant un sospitós, una arma i un lloc.
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
gameRouter.post('/:id/accuse', asyncHandler((req, res) => controller.accuse(req, res)));

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
gameRouter.get('/:id/players', asyncHandler((req, res) => controller.getPlayers(req, res)));

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
gameRouter.get('/:id/instructions', asyncHandler((req, res) => controller.getInstructions(req, res)));

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
gameRouter.get('/:id/solution', asyncHandler((req, res) => controller.getSolution(req, res)));

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
gameRouter.get('/:id/intro', asyncHandler((req, res) => controller.getIntro(req, res)));

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
gameRouter.get('/:id/clues/round/:roundNumber', asyncHandler((req, res) => controller.getCluesByRound(req, res)));

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
gameRouter.get('/:id/players/:playerId/secret', asyncHandler((req, res) => controller.getPlayerSecret(req, res)));

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
gameRouter.post('/:id/timeline/log', asyncHandler((req, res) => controller.logTimelineEvent(req, res)));

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
gameRouter.get('/:id/debug', asyncHandler((req, res) => controller.debug(req, res)));

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
gameRouter.get('/:id/timeline', asyncHandler((req, res) => controller.timeline(req, res)));

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
gameRouter.get('/:id/state', asyncHandler((req, res) => controller.getState(req, res)));

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
gameRouter.get('/:id', asyncHandler((req, res) => controller.getGame(req, res)));

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
gameRouter.post('/:id/end', asyncHandler((req, res) => controller.endGame(req, res)));

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
gameRouter.post('/:id/reset', asyncHandler((req, res) => controller.resetGame(req, res)));

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
gameRouter.get('/:id/users', asyncHandler((req, res) => controller.getUsers(req, res)));

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
gameRouter.delete('/:id/users/:userId', asyncHandler((req, res) => controller.deleteUser(req, res)));

export { gameRouter };
