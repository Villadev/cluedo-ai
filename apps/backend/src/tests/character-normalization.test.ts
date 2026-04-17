import { AIService } from '../services/AIService.js';

const aiService = new AIService() as any;

const testCharacterNormalization = () => {
    console.log("Testing normalizeCharacters...");

    const profiles = [
        {
            name: 'Joan',
            profession: 'P1',
            description: 'D1',
            personality: 'Pers 1',
            secret: 'S1',
            secretKnowledge: 'SK1',
            coartada: { location: 'L1', timeStart: '01:00', timeEnd: '02:00', witness: 'W1', credibility: 'alta' },
            rumor: ['Rumor 1', 'Rumor 2']
        }
    ];

    const caseBible = {
        assassin: 'Joan',
        relationshipMatrix: {
            relations: [
                { a: 'Joan', b: 'Maria', type: 'conflict', strength: 'high', note: 'Deute antic' }
            ]
        }
    };

    const normalized = aiService.normalizeCharacters(profiles, caseBible);
    const char = normalized[0];

    console.log("Normalized values:", {
        rumor: char.rumor,
        relationships: char.relationships,
        tensions: char.tensions
    });

    if (char.rumor === 'Rumor 1, Rumor 2') {
        console.log("PASS: rumor array normalized");
    } else {
        console.error("FAIL: rumor normalization failed", char.rumor);
        process.exit(1);
    }

    if (char.relationships.includes('Maria')) {
        console.log("PASS: relationships from matrix derived");
    } else {
        console.error("FAIL: relationships normalization failed");
        process.exit(1);
    }

    if (char.tensions.includes('Maria')) {
        console.log("PASS: tensions from matrix derived");
    } else {
        console.error("FAIL: tensions normalization failed");
        process.exit(1);
    }
};

testCharacterNormalization();
process.exit(0);
