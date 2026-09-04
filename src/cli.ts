#!/usr/bin/env node
import { TDK } from "./tdk";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const args = rawArgs.filter((a) => a !== "--json");
const command = args[0];
const word = args[1];

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
  if (!command) {
    console.log("Kullanım: tdk <komut> <kelime> [--json]");
    console.log("Komutlar: ara, anlam, koken, ornek, hece, uyum, yazim, gunun, rastgele");
    process.exit(1);
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
