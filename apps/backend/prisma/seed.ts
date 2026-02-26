import { GameStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const cards: Array<{ type: string; value: string }> = [
  { type: 'SUSPECT', value: 'Miss Scarlet' },
  { type: 'SUSPECT', value: 'Colonel Mustard' },
  { type: 'SUSPECT', value: 'Professor Plum' },
  { type: 'SUSPECT', value: 'Mr. Green' },
  { type: 'SUSPECT', value: 'Mrs. Peacock' },
  { type: 'SUSPECT', value: 'Dr. Orchid' },
  { type: 'WEAPON', value: 'Candlestick' },
  { type: 'WEAPON', value: 'Dagger' },
  { type: 'WEAPON', value: 'Lead Pipe' },
  { type: 'WEAPON', value: 'Revolver' },
  { type: 'WEAPON', value: 'Rope' },
  { type: 'WEAPON', value: 'Wrench' },
  { type: 'ROOM', value: 'Kitchen' },
  { type: 'ROOM', value: 'Ballroom' },
  { type: 'ROOM', value: 'Conservatory' },
  { type: 'ROOM', value: 'Dining Room' },
  { type: 'ROOM', value: 'Lounge' },
  { type: 'ROOM', value: 'Hall' },
  { type: 'ROOM', value: 'Study' },
  { type: 'ROOM', value: 'Library' },
  { type: 'ROOM', value: 'Billiard Room' }
];

const run = async (): Promise<void> => {
  await prisma.game.upsert({
    where: { id: 'MAIN_GAME' },
    update: { status: GameStatus.WAITING },
    create: { id: 'MAIN_GAME', status: GameStatus.WAITING }
  });

  const existing = await prisma.card.count();

  if (existing === 0) {
    await prisma.card.createMany({
      data: cards
    });
  }

  process.stdout.write('Seed complete\n');
};

run()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Seed failed';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
