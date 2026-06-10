#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Read CSV with Windows-1252 encoding
const csvPath = path.join(__dirname, "..", "data", "dubois-buyse.csv");
const csvBuffer = fs.readFileSync(csvPath);
const csvContent = csvBuffer.toString("latin1"); // Decode as latin1 (Windows-1252)

// Parse CSV
const lines = csvContent.split("\n");
const header = lines[0].split(";");

console.log("Header:", header);
console.log("Columns: [0]=Mot, [1]=échelon, [4]=Classe");

// Group words by Classe
const wordsByClasse = {
  CP: [],
  CE1: [],
  CE2: [],
  CM1: [],
  CM2: [],
  Collège: [],
};

let lineCount = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const parts = line.split(";");
  const mot = (parts[0] || "").trim();
  const classe = (parts[4] || "").trim();

  if (!mot || !classe) continue;

  if (wordsByClasse[classe]) {
    wordsByClasse[classe].push(mot);
    lineCount++;
  } else {
    console.warn(`Unknown Classe: "${classe}" (word: "${mot}")`);
  }
}

console.log(`\nParsed ${lineCount} words`);
console.log("Words per Classe:");
Object.entries(wordsByClasse).forEach(([classe, words]) => {
  console.log(`  ${classe}: ${words.length} words`);
});

// Write JSON module
const outputPath = path.join(__dirname, "..", "lib", "wordBanks", "french.json");
const outputDir = path.dirname(outputPath);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Sort words alphabetically within each Classe for consistency
Object.keys(wordsByClasse).forEach((classe) => {
  wordsByClasse[classe].sort();
});

fs.writeFileSync(outputPath, JSON.stringify(wordsByClasse, null, 2), "utf8");
console.log(`\nWrote French word bank to: ${outputPath}`);

// Verify: read back and check accents
const readBack = JSON.parse(fs.readFileSync(outputPath, "utf8"));
const sampleCP = readBack.CP.slice(0, 5);
const sampleCE1 = readBack.CE1.slice(0, 5);
console.log("\nVerification - Sample words (check for correct accents):");
console.log("CP samples:", sampleCP);
console.log("CE1 samples:", sampleCE1);

// Look for words with accents
const allWords = Object.values(readBack).flat();
const wordsWithAccents = allWords.filter((w) => /[àâäéèêëîïôöùûüçœæ]/i.test(w));
console.log(`\nWords with accents: ${wordsWithAccents.length} found`);
console.log("Examples:", wordsWithAccents.slice(0, 10));
