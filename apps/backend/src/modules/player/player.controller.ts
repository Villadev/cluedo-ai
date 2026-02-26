import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { PlayerService } from './player.service.js';

const playerService = new PlayerService();

const joinSchema = z.object({
  name: z.string().trim().min(2).max(50),
  role: z.nativeEnum(Role).default(Role.PLAYER)
});

export class PlayerController {
  public async join(req: Request, res: Response): Promise<void> {
    const parsed = joinSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }

    try {
      const player = await playerService.joinPlayer(parsed.data.name, parsed.data.role);
      res.status(201).json(player);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      const status = message.includes('Unique constraint') ? 409 : 400;
      res.status(status).json({ message });
    }
  }

  public async list(_req: Request, res: Response): Promise<void> {
    try {
      const players = await playerService.listPlayers();
      res.status(200).json(players);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      res.status(500).json({ message });
    }
  }
}
