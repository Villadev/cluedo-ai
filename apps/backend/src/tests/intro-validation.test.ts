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
      mentionsLocation: true
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
        mentionsLocation: true
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
    if (tc.mentionsLocation !== undefined && details.mentionsLocation !== tc.mentionsLocation) {
        console.log(`  FAIL detail mentionsLocation: expected ${tc.mentionsLocation}, got ${details.mentionsLocation}`);
        allPassed = false;
    }
    if (tc.mentionsAssassin !== undefined && details.mentionsAssassin !== tc.mentionsAssassin) {
        console.log(`  FAIL detail mentionsAssassin: expected ${tc.mentionsAssassin}, got ${details.mentionsAssassin}`);
        allPassed = false;
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
