import { AIService } from '../services/AIService.js';

async function testIntroValidation() {
  const aiService = new AIService() as any;

  console.log("--- Testing Intro Validation (isValidIntro) ---");

  const testCases = [
    {
      name: "Pass: suggestiu i generic (recorda vs Corda)",
      intro: "Ningú recorda exactament què va passar aquella nit al poble.",
      weapon: "Corda",
      location: "Celler",
      assassin: "Joan",
      expected: true
    },
    {
      name: "Fail: menció exacta de l'arma",
      intro: "La víctima va ser estrangulada amb una corda al mig del passadís.",
      weapon: "Corda",
      location: "Celler",
      assassin: "Joan",
      expected: false,
      mentionsWeapon: true
    },
    {
      name: "Fail: menció exacta del lloc",
      intro: "Tot va començar al celler, on les ombres amaguen secrets.",
      weapon: "Corda",
      location: "Celler",
      assassin: "Joan",
      expected: false,
      mentionsLocationExact: true
    },
    {
      name: "Fail: menció exacta de l'assassí",
      intro: "En Joan caminava nerviós mentre la policia arribava.",
      weapon: "Corda",
      location: "Celler",
      assassin: "Joan",
      expected: false,
      mentionsAssassin: true
    },
    {
      name: "Fail: multi-word weapon match (avoid partial)",
      intro: "Va ser un ganivet de cuina, no un ganivet normal.",
      weapon: "Ganivet de cuina",
      location: "Jardi",
      assassin: "Pere",
      expected: false,
      mentionsWeapon: true
    },
    {
      name: "Pass: suggestiu sense revelacions",
      intro: "La boira cobria el poble i un crit va trencar el silenci de la nit.",
      weapon: "Ganivet",
      location: "Biblioteca",
      assassin: "Maria",
      expected: true
    },
    {
        name: "Fail: diacritics normalization (Jardí matches jardi)",
        intro: "Al jardi tot semblava tranquil.",
        weapon: "Pistola",
        location: "Jardí",
        assassin: "Pau",
        expected: false,
        mentionsLocationExact: true
    },
    {
        name: "Fail: partial location with distinctive token (Torrelles)",
        intro: "S\u0027han sentit crits a prop de Torrelles.",
        weapon: "Veneno",
        location: "Ajuntament de Torrelles",
        assassin: "Lluc",
        expected: false,
        mentionsLocationTokens: true,
        matchedLocationTokens: ["torrelles"]
    },
    {
        name: "Fail: multiple significant tokens (Ajuntament + Torrelles)",
        intro: "Davant de l\u0027ajuntament, a Torrelles, hi ha hagut un incident.",
        weapon: "Veneno",
        location: "Ajuntament de Torrelles",
        assassin: "Lluc",
        expected: false,
        mentionsLocationTokens: true,
        matchedLocationTokens: ["ajuntament", "torrelles"]
    },
    {
        name: "Fail: multiple significant tokens (Biblioteca + Segarra)",
        intro: "La biblioteca de la Segarra amaga molts secrets.",
        weapon: "Ganivet",
        location: "Biblioteca de la Segarra",
        assassin: "Marta",
        expected: false,
        mentionsLocationTokens: true,
        matchedLocationTokens: ["biblioteca", "segarra"]
    },
    {
        name: "Pass: generic wording with common tokens (Celler -> un indret del poble)",
        intro: "Tot ha succeït en un indret del poble que ningú vol visitar.",
        weapon: "Corda",
        location: "Celler del Poble",
        assassin: "Joan",
        expected: true
    }
  ];

  let allPassed = true;
  for (const tc of testCases) {
    const { valid, details } = aiService.isValidIntro(tc.intro, tc.weapon, tc.location, tc.assassin);
    if (valid === tc.expected) {
      console.log(`PASS: ${tc.name}`);
    } else {
      console.log(`FAIL: ${tc.name} (Expected ${tc.expected}, got ${valid})`);
      console.log(`Details: `, details);
      allPassed = false;
    }

    if (tc.mentionsWeapon !== undefined && details.mentionsWeapon !== tc.mentionsWeapon) {
        console.log(`  FAIL detail mentionsWeapon: expected ${tc.mentionsWeapon}, got ${details.mentionsWeapon}`);
        allPassed = false;
    }
    if (tc.mentionsLocationExact !== undefined && details.mentionsLocationExact !== tc.mentionsLocationExact) {
        console.log(`  FAIL detail mentionsLocationExact: expected ${tc.mentionsLocationExact}, got ${details.mentionsLocationExact}`);
        allPassed = false;
    }
    if (tc.mentionsLocationTokens !== undefined && details.mentionsLocationTokens !== tc.mentionsLocationTokens) {
        console.log(`  FAIL detail mentionsLocationTokens: expected ${tc.mentionsLocationTokens}, got ${details.mentionsLocationTokens}`);
        allPassed = false;
    }
    if (tc.mentionsAssassin !== undefined && details.mentionsAssassin !== tc.mentionsAssassin) {
        console.log(`  FAIL detail mentionsAssassin: expected ${tc.mentionsAssassin}, got ${details.mentionsAssassin}`);
        allPassed = false;
    }
    if (tc.matchedLocationTokens !== undefined) {
        const sortedExpected = [...tc.matchedLocationTokens].sort();
        const sortedActual = [...details.matchedLocationTokens].sort();
        if (JSON.stringify(sortedExpected) !== JSON.stringify(sortedActual)) {
            console.log(`  FAIL detail matchedLocationTokens: expected ${JSON.stringify(sortedExpected)}, got ${JSON.stringify(sortedActual)}`);
            allPassed = false;
        }
    }
  }

  if (allPassed) {
    console.log("\nINTRO VALIDATION TESTS PASSED");
  } else {
    console.log("\nINTRO VALIDATION TESTS FAILED");
    process.exit(1);
  }
}

testIntroValidation();
