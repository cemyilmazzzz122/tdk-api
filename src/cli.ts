#!/usr/bin/env node
import { TDK } from "./tdk";

const args = process.argv.slice(2);
const command = args[0];
const word = args[1];

async function run() {
  if (!command) {
    console.log("Kullanım: tdk <komut> <kelime>");
    console.log("Komutlar: ara, anlam, koken, ornek, hece, uyum, yazim");
    process.exit(1);
  }

  TDK.enableCache(false);

  try {
    switch (command) {
      case "ara":
      case "anlam":
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const meanings = await TDK.getMeanings(word);
        if (meanings.length === 0) {
          console.log("Sonuç bulunamadı.");
        } else {
          meanings.forEach((m, i) => console.log(`${i + 1}. ${m}`));
        }
        break;

      case "koken":
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const origin = await TDK.getOrigin(word);
        console.log(`Köken: ${origin}`);
        break;

      case "ornek":
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const examples = await TDK.getExamples(word);
        if (examples.length === 0) {
          console.log("Örnek bulunamadı.");
        } else {
          examples.forEach((ex, i) => {
            const yazar = ex.author ? ` (${ex.author})` : "";
            console.log(`${i + 1}. ${ex.sentence}${yazar}`);
          });
        }
        break;

      case "hece":
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const syllables = TDK.syllabicate(word);
        console.log(`Heceler: ${syllables.join("-")}`);
        break;

      case "uyum":
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const isHarmony = TDK.checkVowelHarmony(word);
        console.log(`Büyük Ünlü Uyumu: ${isHarmony ? "Uyar" : "Uymaz"}`);
        break;

      case "yazim":
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const spellResult = await TDK.checkSpelling(word);
        if (spellResult.isCorrect) {
          console.log("Doğru yazım.");
        } else {
          console.log(`Yanlış yazım.${spellResult.suggestion ? " Doğrusu: " + spellResult.suggestion : ""}`);
        }
        break;

      default:
        console.log("Bilinmeyen komut.");
    }
  } catch (error) {
    if (error instanceof Error) {
      console.log(`Hata: ${error.message}`);
    }
  }
}

run();
