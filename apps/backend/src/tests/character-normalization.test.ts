import { AIService } from '../services/AIService.js';

const aiService = new AIService() as any;

const testCharacterNormalization = () => {
    console.log("Testing normalizeCharacters...");

    const basicCharacters = [
        { name: 'Character 1', profession: 'P1', possibleMotive: 'M1' }
    ];

    const aiCharacters = [
        {
            name: 'Character 1',
            description: 'D1',
            personality: 'Pers 1',
            secret: 'S1',
            secretKnowledge: 'SK1',
            coartada: { location: 'L1', timeStart: '01:00', timeEnd: '02:00', witness: 'W1', credibility: 'alta' },
            rumor: ['Rumor 1', 'Rumor 2'], // Array test
            relationships: { friend: 'F1', enemy: 'E1' }, // Object test
            tensions: 'String tension' // String test
        }
    ];

    const profiles = [
        {
            name: 'Character 1',
            profession: 'P1',
            description: 'D1',
            personality: 'Pers 1',
            secret: 'S1',
            secretKnowledge: 'SK1',
            coartada: { location: 'L1', timeStart: '01:00', timeEnd: '02:00', witness: 'W1', credibility: 'alta' },
            rumor: ['Rumor 1', 'Rumor 2']
        }
    ];

    const relations = [
        {
            name: 'Character 1',
            relationships: { friend: 'F1', enemy: 'E1' },
            tensions: 'String tension'
        }
    ];

    const caseBible = { assassin: 'Character 1' };

    const normalized = aiService.normalizeCharacters(relations, profiles, caseBible);
    const char = normalized[0];

    console.log("Normalized values:", {
        rumor: char.rumor,
        relationships: char.relationships,
        tensions: char.tensions
    });

    if (char.rumor === 'Rumor 1, Rumor 2') {
        console.log("PASS: rumor array normalized");
    } else {
        console.error("FAIL: rumor normalization failed");
        process.exit(1);
    }

    if (char.relationships === JSON.stringify({ friend: 'F1', enemy: 'E1' })) {
        console.log("PASS: relationships object normalized");
    } else {
        console.error("FAIL: relationships normalization failed");
        process.exit(1);
    }

    if (char.tensions === 'String tension') {
        console.log("PASS: tensions string preserved");
    } else {
        console.error("FAIL: tensions string failed");
        process.exit(1);
    }

    // Test fallbacks
    const profilesEmpty = [{ name: 'Character 1' }];
    const relationsEmpty = [{ name: 'Character 1' }];
    const normalizedEmpty = aiService.normalizeCharacters(relationsEmpty, profilesEmpty, caseBible);
    const charEmpty = normalizedEmpty[0];

    if (charEmpty.relationships === 'Cap relació') {
        console.log("PASS: fallback for missing field works");
    } else {
        console.error("FAIL: fallback for missing field failed", charEmpty.relationships);
        process.exit(1);
    }
};

testCharacterNormalization();
process.exit(0);
