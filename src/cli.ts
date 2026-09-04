#!/usr/bin/env node
import { TDK } from "./tdk";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const args = rawArgs.filter((a) => a !== "--json");
const KNOWN_COMMANDS = new Set([
  "ara",
  "anlam",
  "koken",
  "ornek",
  "hece",
  "uyum",
  "yazim",
  "gunun",
  "rastgele",
  "esanlam",
  "karsit",
  "yabanci",
  "kurallar",
  "kural",
  "karsilastir",
  "analiz",
]);

let command = args[0];
let word = args.slice(1).join(" ");

if (command && !KNOWN_COMMANDS.has(command) && command !== "--help" && command !== "-h") {
  word = args.join(" ");
  command = "anlam";
}

function printResult(data: unknown, formatted: () => void) {
  if (jsonMode) {
    console.log(JSON.stringify(data));
  } else {
    formatted();
  }
}

function printError(message: string) {
  if (jsonMode) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.log(`Hata: ${message}`);
  }
}

async function run() {
  if (!command || command === "--help" || command === "-h") {
    console.log("Kullanım: tdk [komut] <kelime> [--json]");
    console.log(
      "Komutlar: ara, anlam, koken, ornek, hece, uyum, yazim, gunun, rastgele, esanlam, karsit, yabanci, kurallar, kural, karsilastir, analiz"
    );
    console.log("Not: Komut belirtilmezse doğrudan kelime anlamı aranır (örn: tdk selam)");
    process.exit(command ? 0 : 1);
  }

  TDK.enableCache(false);

  try {
    switch (command) {
      case "ara":
      case "anlam": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const meanings = await TDK.getMeanings(word);
        printResult(meanings, () => {
          if (meanings.length === 0) {
            console.log("Sonuç bulunamadı.");
          } else {
            meanings.forEach((m, i) => console.log(`${i + 1}. ${m}`));
          }
        });
        break;
      }

      case "koken": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const origin = await TDK.getOrigin(word);
        printResult({ word, origin }, () => console.log(`Köken: ${origin}`));
        break;
      }

      case "ornek": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const examples = await TDK.getExamples(word);
        printResult(examples, () => {
          if (examples.length === 0) {
            console.log("Örnek bulunamadı.");
          } else {
            examples.forEach((ex, i) => {
              const yazar = ex.author ? ` (${ex.author})` : "";
              console.log(`${i + 1}. ${ex.sentence}${yazar}`);
            });
          }
        });
        break;
      }

      case "hece": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const syllables = TDK.syllabicate(word);
        printResult(syllables, () => console.log(`Heceler: ${syllables.join("-")}`));
        break;
      }

      case "uyum": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const isHarmony = TDK.checkVowelHarmony(word);
        printResult({ word, harmony: isHarmony }, () =>
          console.log(`Büyük Ünlü Uyumu: ${isHarmony ? "Uyar" : "Uymaz"}`)
        );
        break;
      }

      case "yazim": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const spellResult = await TDK.checkSpelling(word);
        printResult(spellResult, () => {
          if (spellResult.isCorrect) {
            console.log("Doğru yazım.");
          } else {
            console.log(`Yanlış yazım.${spellResult.suggestion ? " Doğrusu: " + spellResult.suggestion : ""}`);
          }
        });
        break;
      }

      case "gunun": {
        const wotd = await TDK.getWordOfTheDay();
        printResult(wotd, () => {
          if (!wotd) {
            console.log("Günün kelimesi alınamadı.");
          } else {
            console.log(`Günün kelimesi: ${wotd.word}`);
            wotd.meanings.forEach((m, i) => console.log(`${i + 1}. ${m}`));
          }
        });
        break;
      }

      case "rastgele": {
        const pick = await TDK.getRandomWord();
        printResult(pick, () => {
          if (!pick) {
            console.log("Rastgele içerik alınamadı.");
          } else {
            const label = pick.type === "kelime" ? "Kelime" : "Atasözü";
            console.log(`${label}: ${pick.madde}`);
            console.log(pick.anlam);
          }
        });
        break;
      }

      case "esanlam": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const synonyms = await TDK.getSynonyms(word);
        printResult(synonyms, () => {
          if (synonyms.length === 0) {
            console.log("Eş anlamlı kelime bulunamadı.");
          } else {
            synonyms.forEach((s, i) => console.log(`${i + 1}. ${s}`));
          }
        });
        break;
      }

      case "karsit": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const antonyms = await TDK.getAntonyms(word);
        printResult(antonyms, () => {
          if (antonyms.length === 0) {
            console.log("Zıt anlamlı kelime bulunamadı.");
          } else {
            antonyms.forEach((s, i) => console.log(`${i + 1}. ${s}`));
          }
        });
        break;
      }

      case "yabanci": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const foreign = await TDK.isForeignWord(word);
        printResult({ word, foreign }, () => {
          if (foreign === null) {
            console.log("Kelime bulunamadı.");
          } else {
            console.log(foreign ? "Yabancı kökenli." : "Türkçe kökenli.");
          }
        });
        break;
      }

      case "kurallar": {
        const rules = await TDK.getKurallar();
        printResult(rules, () => {
          if (rules.length === 0) {
            console.log("Kural listesi alınamadı.");
          } else {
            rules.forEach((r, i) => console.log(`${i + 1}. ${r.adi}`));
          }
        });
        break;
      }

      case "kural": {
        if (!word) throw new Error("Kural adı belirtmelisiniz.");
        const rule = await TDK.getRule(word);
        printResult(rule, () => {
          console.log(rule ?? "Kural bulunamadı.");
        });
        break;
      }

      case "karsilastir": {
        const [wordA, wordB] = args.slice(1);
        if (!wordA || !wordB) throw new Error("İki kelime belirtmelisiniz.");
        const comparison = await TDK.compareWords(wordA, wordB);
        printResult(comparison, () => {
          for (const side of [comparison.a, comparison.b]) {
            console.log(`${side.word}: ${side.meaningCount} anlam, köken: ${side.origin ?? "bulunamadı"}, hece: ${side.syllables.join("-")}, büyük ünlü uyumu: ${side.harmony ? "uyar" : "uymaz"}`);
          }
        });
        break;
      }

      case "analiz": {
        if (!word) throw new Error("Metin belirtmelisiniz.");
        const analysis = await TDK.analyzeText(word);
        printResult(analysis, () => {
          if (analysis.length === 0) {
            console.log("Analiz edilecek kelime bulunamadı.");
          } else {
            analysis.forEach((a) => {
              if (a.found) {
                console.log(`${a.word}: ${a.meaning ?? "-"} (${a.origin})`);
              } else {
                console.log(`${a.word}: bulunamadı`);
              }
            });
          }
        });
        break;
      }

      default:
        printError("Bilinmeyen komut.");
    }
  } catch (error) {
    if (error instanceof Error) {
      printError(error.message);
    }
  }
}

run();
