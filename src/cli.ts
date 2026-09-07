#!/usr/bin/env node
import { TDK } from "./tdk";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const args = rawArgs.filter((a) => a !== "--json");

const isColor = !jsonMode && Boolean(process.stdout.isTTY);
const c = {
  bold: (s: string) => (isColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (isColor ? `\x1b[2m${s}\x1b[0m` : s),
  green: (s: string) => (isColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (isColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (isColor ? `\x1b[36m${s}\x1b[0m` : s),
  red: (s: string) => (isColor ? `\x1b[31m${s}\x1b[0m` : s),
};

const KNOWN_COMMANDS = new Set([
  "ara",
  "anlam",
  "koken",
  "ornek",
  "hece",
  "uyum",
  "kucukuyum",
  "yazim",
  "kok",
  "stem",
  "deyim",
  "gunun",
  "rastgele",
  "esanlam",
  "karsit",
  "yabanci",
  "kurallar",
  "kural",
  "karsilastir",
  "analiz",
  "oneri",
  "bulmaca",
  "pattern",
  "anagram",
  "kafiye",
  "rhyme",
  "denetle",
  "proofread",
  "repl",
  "kubbealti",
  "nisanyan",
  "viki",
]);

let command = args[0];
let word = args.slice(1).join(" ");

if (command && !KNOWN_COMMANDS.has(command) && command !== "--help" && command !== "-h" && command !== "--version" && command !== "-v") {
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
    console.log(c.red(`Hata: ${message}`));
  }
}

async function startRepl() {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.cyan("tdk> "),
  });

  console.log(c.bold("TDK İnteraktif Sözlük Kabuğu (Çıkmak için 'exit' veya Ctrl+C)"));
  console.log(c.dim("Komutlar: ara <kelime>, hece <kelime>, bulmaca <desen>, denetle <metin> veya doğrudan kelime"));
  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ".exit") {
      rl.close();
      return;
    }

    const parts = trimmed.split(/\s+/);
    let subCmd = parts[0].toLowerCase();
    let subArg = parts.slice(1).join(" ");
    if (!KNOWN_COMMANDS.has(subCmd)) {
      subArg = trimmed;
      subCmd = "anlam";
    }

    try {
      if (subCmd === "ara" || subCmd === "anlam") {
        const meanings = await TDK.getMeanings(subArg);
        if (meanings.length === 0) console.log(c.dim("Sonuç bulunamadı."));
        else meanings.forEach((m, i) => console.log(`${i + 1}. ${c.green(m)}`));
      } else if (subCmd === "koken") {
        const origin = await TDK.getOrigin(subArg);
        console.log(`Köken: ${c.cyan(origin || "Bilinmiyor")}`);
      } else if (subCmd === "hece") {
        const s = TDK.syllabicate(subArg);
        console.log(`Heceler: ${c.yellow(s.join("-"))}`);
      } else if (subCmd === "uyum") {
        const h = TDK.checkVowelHarmony(subArg);
        console.log(`Büyük Ünlü Uyumu: ${h ? c.green("Uyar") : c.red("Uymaz")}`);
      } else if (subCmd === "kucukuyum") {
        const h = TDK.checkLabialHarmony(subArg);
        console.log(`Küçük Ünlü Uyumu: ${h ? c.green("Uyar") : c.red("Uymaz")}`);
      } else if (subCmd === "bulmaca" || subCmd === "pattern") {
        const matches = await TDK.patternSearch(subArg);
        console.log(matches.slice(0, 15).join(", "));
      } else if (subCmd === "denetle" || subCmd === "proofread") {
        const res = await TDK.proofread(subArg);
        if (res.isCorrect) console.log(c.green("✓ Sorun bulunamadı."));
        else res.issues.forEach((iss) => console.log(`- ${c.yellow(iss.word)}: ${iss.message}${iss.suggestion ? " -> " + c.green(iss.suggestion) : ""}`));
      } else {
        console.log(c.dim("Örnek komutlar: 'ara kalem', 'hece elektrik', 'bulmaca k_l_m', 'denetle Bugün evdeyim'"));
      }
    } catch (e: any) {
      console.log(c.red(`Hata: ${e?.message || e}`));
    }
    rl.prompt();
  });
}

async function run() {
  if (!command) {
    if (process.stdin.isTTY) {
      await startRepl();
      return;
    }
    console.log("Kullanım: tdk [komut] <kelime> [--json]");
    console.log(
      "Komutlar: ara, anlam, koken, ornek, hece, uyum, kucukuyum, yazim, kok, deyim, gunun, rastgele, esanlam, karsit, yabanci, kurallar, kural, karsilastir, analiz, oneri, bulmaca, anagram, kafiye, denetle, repl, kubbealti, nisanyan, viki"
    );
    console.log("Not: Komut belirtilmezse doğrudan kelime anlamı aranır (örn: tdk selam)");
    process.exit(1);
  }

  if (command === "--version" || command === "-v") {
    console.log("tdk-api-wrapper v1.5.0");
    process.exit(0);
  }

  if (command === "--help" || command === "-h") {
    console.log("Kullanım: tdk [komut] <kelime> [--json]");
    console.log(
      "Komutlar: ara, anlam, koken, ornek, hece, uyum, kucukuyum, yazim, kok, deyim, gunun, rastgele, esanlam, karsit, yabanci, kurallar, kural, karsilastir, analiz, oneri, bulmaca, anagram, kafiye, denetle, repl, kubbealti, nisanyan, viki"
    );
    console.log("Not: Komut belirtilmezse doğrudan kelime anlamı aranır (örn: tdk selam)");
    process.exit(0);
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

      case "kucukuyum":
      case "labial": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const isHarmony = TDK.checkLabialHarmony(word);
        printResult({ word, labialHarmony: isHarmony }, () =>
          console.log(`Küçük Ünlü Uyumu: ${isHarmony ? "Uyar" : "Uymaz"}`)
        );
        break;
      }

      case "yazim": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const spellResult = await TDK.checkSpelling(word);
        printResult(spellResult, () => {
          if (spellResult.isCorrect) {
            if (spellResult.isInflected && spellResult.root) {
              console.log(`Doğru yazım (çekimli biçim, kök: ${spellResult.root}).`);
            } else {
              console.log("Doğru yazım.");
            }
          } else {
            console.log(`Yanlış yazım.${spellResult.suggestion ? " Doğrusu: " + spellResult.suggestion : ""}`);
          }
        });
        break;
      }

      case "kok":
      case "stem": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const stemResult = await TDK.stem(word);
        printResult(stemResult, () => {
          if (!stemResult) {
            console.log("Kök bulunamadı.");
          } else if (stemResult.isInflected) {
            console.log(`Kök: ${stemResult.root} (çekimli biçim)`);
          } else {
            console.log(`Kök: ${stemResult.root} (yalın biçim)`);
          }
        });
        break;
      }

      case "deyim": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const proverbs = await TDK.getProverbs(word);
        printResult(proverbs, () => {
          if (proverbs.length === 0) {
            console.log("Atasözü/deyim bulunamadı.");
          } else {
            proverbs.forEach((p, i) => console.log(`${i + 1}. ${p}`));
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
                const rootLabel = a.isInflected && a.root ? ` (kök: ${a.root})` : "";
                console.log(`${a.word}${rootLabel}: ${a.meaning ?? "-"} (${a.origin})`);
              } else {
                console.log(`${a.word}: bulunamadı`);
              }
            });
          }
        });
        break;
      }

      case "oneri": {
        if (!word) throw new Error("Önek belirtmelisiniz.");
        const suggestions = await TDK.getSuggestions(word);
        printResult(suggestions, () => {
          if (suggestions.length === 0) {
            console.log("Öneri bulunamadı.");
          } else {
            suggestions.forEach((s, i) => console.log(`${i + 1}. ${s}`));
          }
        });
        break;
      }

      case "bulmaca":
      case "pattern": {
        if (!word) throw new Error("Desen belirtmelisiniz (örn: k_l_m).");
        const matches = await TDK.patternSearch(word);
        printResult(matches, () => {
          if (matches.length === 0) {
            console.log("Eşleşen kelime bulunamadı.");
          } else {
            console.log(c.bold(`Bulunan Kelimeler (${matches.length}):`));
            matches.forEach((m, i) => console.log(`${i + 1}. ${c.cyan(m)}`));
          }
        });
        break;
      }

      case "anagram": {
        if (!word) throw new Error("Harfler belirtmelisiniz.");
        const anagrams = await TDK.findAnagrams(word);
        printResult(anagrams, () => {
          if (anagrams.length === 0) {
            console.log("Anagram veya bu harflerle türetilebilecek kelime bulunamadı.");
          } else {
            const clean = word.trim().toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşüâîû]/gi, "");
            const hasExact = anagrams.some((a) => a.length === clean.length);
            const title = hasExact
              ? `Anagramlar (${anagrams.length}):`
              : `Birebir anagram bulunamadı. Bu harflerle türetilen kelimeler (${anagrams.length}):`;
            console.log(c.bold(title));
            anagrams.forEach((a, i) => console.log(`${i + 1}. ${c.green(a)} ${c.dim(`(${a.length} harf)`)}`));
          }
        });
        break;
      }

      case "kafiye":
      case "rhyme": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const rhymes = await TDK.findRhymes(word);
        printResult(rhymes, () => {
          if (rhymes.length === 0) {
            console.log("Kafiye bulunamadı.");
          } else {
            console.log(c.bold(`Kafiyeli Kelimeler (${rhymes.length}):`));
            rhymes.forEach((r, i) => console.log(`${i + 1}. ${c.yellow(r)}`));
          }
        });
        break;
      }

      case "denetle":
      case "proofread": {
        if (!word) throw new Error("Metin belirtmelisiniz.");
        const result = await TDK.proofread(word);
        printResult(result, () => {
          if (result.isCorrect) {
            console.log(c.green("✓ Metinde imla veya bağlaç hatası tespit edilmedi."));
          } else {
            console.log(c.bold(c.red(`Metinde ${result.issues.length} olası sorun tespit edildi:`)));
            result.issues.forEach((issue, i) => {
              const label = c.yellow(`[${issue.type}]`);
              const sug = issue.suggestion ? c.green(` -> Öneri: ${issue.suggestion}`) : "";
              console.log(`${i + 1}. ${label} "${c.bold(issue.word)}": ${issue.message}${sug}`);
            });
          }
        });
        break;
      }

      case "repl": {
        await startRepl();
        break;
      }

      case "kubbealti": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const meanings = await TDK.getKubbealtiMeanings(word);
        printResult(meanings, () => {
          if (!meanings) {
            console.log("Kubbealtı Lugatı'na ulaşılamadı.");
          } else if (meanings.length === 0) {
            console.log("Sonuç bulunamadı.");
          } else {
            meanings.forEach((m, i) => console.log(`${i + 1}. ${m}`));
          }
        });
        break;
      }

      case "nisanyan": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const origin = await TDK.getNisanyan(word);
        printResult(origin, () => console.log(origin ?? "Sonuç bulunamadı."));
        break;
      }

      case "viki": {
        if (!word) throw new Error("Kelime belirtmelisiniz.");
        const entry = await TDK.getWiktionary(word);
        printResult(entry, () => {
          if (!entry) {
            console.log("Sonuç bulunamadı.");
          } else {
            for (const [title, content] of Object.entries(entry.sections)) {
              if (content) console.log(`-- ${title} --\n${content}\n`);
            }
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
