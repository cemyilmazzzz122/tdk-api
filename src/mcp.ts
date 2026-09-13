import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TDK, TDKClient } from "./tdk";
import { VERSION } from "./version";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** Serialize any payload as a pretty JSON text block. */
function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Serialize an error as a JSON text block flagged with `isError`. */
function fail(message: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

/** Wrap a handler so any thrown error becomes a structured `isError` result. */
function guard<A>(fn: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  };
}

export interface McpServerOptions {
  /** Client whose configuration and caches the tools use (default: the shared `TDK` instance). */
  client?: TDKClient;
}

/**
 * Builds the TDK MCP server: every meaningful `TDKClient` method is surfaced
 * as a Model Context Protocol tool so an LLM client (Claude Desktop, Cursor,
 * Antigravity, …) can query Turkish dictionary, morphology, spelling and
 * etymology data directly. All tools return JSON text; network/scraping
 * failures come back as `{ "error": ... }` with `isError: true` rather than
 * throwing.
 */
export function createMcpServer(options: McpServerOptions = {}): McpServer {
  const tdk = options.client ?? TDK;
  const server = new McpServer({
    name: "TDK API Server",
    version: VERSION,
  });

  // --- Core dictionary ------------------------------------------------------

  server.tool(
    "tdk_lookup",
    "Bir kelimenin TDK Güncel Türkçe Sözlük'teki ham kaydını (tüm anlamlar, örnekler, birleşikler, köken, atasözleri) döndürür.",
    { word: z.string().describe("Aranacak Türkçe kelime (örn: 'kalem').") },
    guard(async ({ word }) => {
      const results = await tdk.getWord(word);
      if (results.length === 0) return fail(`"${word}" TDK sözlüğünde bulunamadı.`);
      return ok(results);
    })
  );

  server.tool(
    "tdk_meanings",
    "Bir kelimenin sadeleştirilmiş anlam listesini (madde madde tanımlar) döndürür.",
    { word: z.string().describe("Aranacak Türkçe kelime.") },
    guard(async ({ word }) => ok({ word, meanings: await tdk.getMeanings(word) }))
  );

  server.tool(
    "tdk_examples",
    "Bir kelimenin sözlükteki örnek cümlelerini (varsa yazarıyla) döndürür.",
    { word: z.string().describe("Aranacak Türkçe kelime.") },
    guard(async ({ word }) => ok({ word, examples: await tdk.getExamples(word) }))
  );

  server.tool(
    "tdk_proverbs",
    "Bir kelime ile kurulan atasözü ve deyimleri listeler.",
    { word: z.string().describe("Aranacak Türkçe kelime (örn: 'göz').") },
    guard(async ({ word }) => ok({ word, proverbs: await tdk.getProverbs(word) }))
  );

  server.tool(
    "tdk_compound_words",
    "Bir kelime ile oluşturulmuş birleşik kelimeleri listeler (örn: 'kalem' -> 'dolma kalem').",
    { word: z.string().describe("Aranacak Türkçe kelime.") },
    guard(async ({ word }) => ok({ word, compounds: await tdk.getCompoundWords(word) }))
  );

  server.tool(
    "tdk_part_of_speech",
    "Bir kelimenin sözcük türlerini (isim, sıfat, zarf, fiil vb.) döndürür.",
    { word: z.string().describe("Aranacak Türkçe kelime.") },
    guard(async ({ word }) => ok({ word, partsOfSpeech: await tdk.getPartOfSpeech(word) }))
  );

  server.tool(
    "tdk_synonyms",
    "Bir kelimenin eş anlamlılarını (yakın anlamlı kelimeler) döndürür.",
    { word: z.string().describe("Aranacak Türkçe kelime.") },
    guard(async ({ word }) => ok({ word, synonyms: await tdk.getSynonyms(word) }))
  );

  server.tool(
    "tdk_antonyms",
    "Bir kelimenin zıt (karşıt) anlamlılarını döndürür.",
    { word: z.string().describe("Aranacak Türkçe kelime.") },
    guard(async ({ word }) => ok({ word, antonyms: await tdk.getAntonyms(word) }))
  );

  // --- Etymology ----------------------------------------------------------

  server.tool(
    "tdk_origin",
    "Bir kelimenin TDK'deki köken bilgisini ve yabancı kökenli olup olmadığını döndürür.",
    {
      word: z.string().describe("Aranacak Türkçe kelime."),
      fallback_stem: z
        .boolean()
        .default(true)
        .describe("Kelime sözlükte yoksa (çekimli biçim) kökünün kökenine bak."),
    },
    guard(async ({ word, fallback_stem }) => {
      const origin = await tdk.getOrigin(word, fallback_stem);
      return ok({ word, origin, isForeign: origin === null ? null : origin !== "Türkçe" });
    })
  );

  server.tool(
    "tdk_nisanyan",
    "Nişanyan Sözlük'ten bir kelimenin ayrıntılı etimolojisini (server-rendered meta açıklaması) çeker.",
    { word: z.string().describe("Etimolojisi aranacak kelime.") },
    guard(async ({ word }) => {
      const etymology = await tdk.getNisanyan(word);
      return etymology ? ok({ word, etymology }) : fail(`Nişanyan Sözlük'te "${word}" bulunamadı.`);
    })
  );

  server.tool(
    "tdk_kubbealti",
    "Kubbealtı Lugatı'ndan (ticari sözlük) bir kelimenin anlamlarını çeker.",
    { word: z.string().describe("Aranacak kelime.") },
    guard(async ({ word }) => {
      const meanings = await tdk.getKubbealtiMeanings(word);
      if (meanings === null) return fail("Kubbealtı Lugatı'na ulaşılamadı.");
      return ok({ word, meanings });
    })
  );

  server.tool(
    "tdk_wiktionary",
    "Türkçe Wiktionary'den (tr.wiktionary.org, resmi MediaWiki API) bir maddenin bölümlere ayrılmış içeriğini çeker.",
    {
      word: z.string().describe("Aranacak madde başlığı."),
      section: z
        .string()
        .optional()
        .describe("Sadece belirli bir bölüm istenirse başlık adı (örn: 'Köken', 'Çeviriler')."),
    },
    guard(async ({ word, section }) => {
      if (section) {
        const text = await tdk.getWiktionarySection(word, section);
        return text
          ? ok({ word, section, text })
          : fail(`Wiktionary'de "${word}" için "${section}" bölümü bulunamadı.`);
      }
      const entry = await tdk.getWiktionary(word);
      return entry ? ok(entry) : fail(`Wiktionary'de "${word}" bulunamadı.`);
    })
  );

  // --- Spelling & morphology --------------------------------------------

  server.tool(
    "tdk_spell_check",
    "Bir kelimenin doğru yazılıp yazılmadığını denetler; yanlışsa klavye/diakritik farkındalıklı en yakın madde önerisi verir, çekimli biçimse kökünü döndürür.",
    { word: z.string().describe("Yazımı denetlenecek kelime (örn: 'yanlız', 'arabs').") },
    guard(async ({ word }) => ok(await tdk.checkSpelling(word)))
  );

  server.tool(
    "tdk_proofread",
    "Bir Türkçe metni imla, ayrı/bitişik yazım ve 'da/de', 'ki', 'mi' bağlaç/ek hataları açısından denetler.",
    { text: z.string().describe("Denetlenecek Türkçe metin.") },
    guard(async ({ text }) => ok(await tdk.proofread(text)))
  );

  server.tool(
    "tdk_stem",
    "Bir kelimenin morfolojik kökünü (ek sıyırma / stemming) bulur ve çekimli olup olmadığını belirtir (örn: 'kitabımızın' -> 'kitap').",
    { word: z.string().describe("Kökü aranacak kelime.") },
    guard(async ({ word }) => {
      const result = await tdk.stem(word);
      return result ? ok(result) : fail(`"${word}" için kök tespit edilemedi.`);
    })
  );

  server.tool(
    "tdk_analyze_text",
    "Bir metindeki her kelime için kök, anlam ve köken bilgisini toplu olarak çıkarır.",
    { text: z.string().describe("Analiz edilecek Türkçe metin.") },
    guard(async ({ text }) => ok(await tdk.analyzeText(text)))
  );

  server.tool(
    "tdk_syllables",
    "Bir kelimeyi Türkçe hece kurallarına göre hecelere ayırır (tamamen yerel, ağ isteği yok).",
    { word: z.string().describe("Hecelenecek kelime.") },
    guard(async ({ word }) => ok({ word, syllables: tdk.syllabicate(word) }))
  );

  server.tool(
    "tdk_vowel_harmony",
    "Bir kelimenin büyük ünlü uyumuna ve küçük ünlü uyumuna (düzlük-yuvarlaklık) uyup uymadığını kontrol eder.",
    { word: z.string().describe("Kontrol edilecek kelime.") },
    guard(async ({ word }) =>
      ok({
        word,
        vowelHarmony: tdk.checkVowelHarmony(word),
        labialHarmony: tdk.checkLabialHarmony(word),
      })
    )
  );

  // --- Word tools ------------------------------------------------------

  server.tool(
    "tdk_autocomplete",
    "Bir önek ile başlayan sözlük maddelerini (autocomplete) Türk alfabesi sırasıyla döndürür.",
    {
      prefix: z.string().describe("Aranacak önek (örn: 'kalem')."),
      max_results: z.number().int().min(1).max(100).default(10).describe("En fazla sonuç sayısı."),
      fold_diacritics: z
        .boolean()
        .default(true)
        .describe("Birebir önek eşleşmesi az kalırsa Türkçe harf/şapka farkını yok sayan eşleşmelerle tamamla (örn: 'kagit' -> 'kâğıt')."),
    },
    guard(async ({ prefix, max_results, fold_diacritics }) =>
      ok({
        prefix,
        suggestions: await tdk.getSuggestions(prefix, max_results, { foldDiacritics: fold_diacritics }),
      })
    )
  );

  server.tool(
    "tdk_pattern_search",
    "Bulmaca deseni ile eşleşen sözlük maddelerini bulur: '_' veya '?' tek harf, '*' sıfır ya da daha fazla harf yerine geçer (örn: 'k_l_m').",
    {
      pattern: z.string().describe("Desen. '_'/'?' = tek harf, '*' = sıfır ya da daha fazla harf."),
      max_results: z.number().int().min(1).max(500).default(50).describe("En fazla sonuç sayısı."),
    },
    guard(async ({ pattern, max_results }) => {
      const matches = await tdk.patternSearch(pattern, { maxResults: max_results });
      return ok({ pattern, count: matches.length, matches });
    })
  );

  server.tool(
    "tdk_anagram",
    "Verilen harflerle kurulabilecek Türkçe sözlük maddelerini bulur. Birebir anagram varsa onlar, yoksa harflerin bir alt kümesiyle kurulan kelimeler döner.",
    {
      letters: z.string().describe("Kullanılacak harfler (örn: 'kalem')."),
      exact_length: z.boolean().default(false).describe("Sadece harflerin tamamını kullanan birebir anagramları döndür."),
      max_results: z.number().int().min(1).max(500).default(50).describe("En fazla sonuç sayısı."),
    },
    guard(async ({ letters, exact_length, max_results }) => {
      const words = await tdk.findAnagrams(letters, { exactLength: exact_length, maxResults: max_results });
      return ok({ letters, count: words.length, words });
    })
  );

  server.tool(
    "tdk_rhymes",
    "Bir kelime ile kafiyeli (son harfleri uyuşan) sözlük maddelerini bulur.",
    {
      word: z.string().describe("Kafiyesi aranacak kelime."),
      min_letters: z.number().int().min(1).default(3).describe("Uyuşması gereken en az son harf sayısı."),
      max_results: z.number().int().min(1).max(500).default(50).describe("En fazla sonuç sayısı."),
    },
    guard(async ({ word, min_letters, max_results }) => {
      const rhymes = await tdk.findRhymes(word, { minLetters: min_letters, maxResults: max_results });
      return ok({ word, count: rhymes.length, rhymes });
    })
  );

  server.tool(
    "tdk_compare",
    "İki kelimeyi anlam sayısı, köken, hece bölünüşü ve ünlü uyumu açısından karşılaştırır.",
    {
      a: z.string().describe("Birinci kelime."),
      b: z.string().describe("İkinci kelime."),
    },
    guard(async ({ a, b }) => ok(await tdk.compareWords(a, b)))
  );

  server.tool(
    "tdk_audio_url",
    "Bir kelimenin TDK seslendirme (.wav) URL'sini döndürür (bulunamazsa null).",
    { word: z.string().describe("Seslendirmesi aranacak kelime.") },
    guard(async ({ word }) => ok({ word, audioUrl: await tdk.getAudioUrl(word) }))
  );

  // --- Daily / reference content --------------------------------------

  server.tool(
    "tdk_word_of_the_day",
    "TDK'nin 'günün kelimesi'ni anlamlarıyla döndürür.",
    {},
    guard(async () => {
      const wotd = await tdk.getWordOfTheDay();
      return wotd ? ok(wotd) : fail("Günün kelimesi alınamadı.");
    })
  );

  server.tool(
    "tdk_random_word",
    "TDK içeriğinden rastgele bir kelime ya da atasözü döndürür.",
    {},
    guard(async () => {
      const pick = await tdk.getRandomWord();
      return pick ? ok(pick) : fail("Rastgele içerik alınamadı.");
    })
  );

  server.tool(
    "tdk_rules",
    "TDK Yazım Kılavuzu kurallarını listeler; 'name' verilirse o kuralın tam metnini döndürür.",
    {
      name: z.string().optional().describe("İstenirse tek bir kuralın adı (örn: 'Bağlaç Olan da, de'nin Yazılışı')."),
    },
    guard(async ({ name }) => {
      if (name) {
        const rule = await tdk.getRule(name);
        return rule ? ok({ name, rule }) : fail(`"${name}" kuralı bulunamadı.`);
      }
      const rules = await tdk.getKurallar();
      return ok({ count: rules.length, rules });
    })
  );

  return server;
}

/** Starts the TDK MCP server over stdio (used by the `tdk mcp` CLI command). */
export async function runMcpServer(): Promise<void> {
  // Standalone server with its own client: persist the headword list and lookups on disk
  // (opt out with TDK_DISK_CACHE=0) and warm the list in the background so headword tools
  // answer instantly. Strict mode makes tools report "source unreachable" as an error
  // instead of an empty result.
  const client = new TDKClient({ diskCache: process.env.TDK_DISK_CACHE !== "0", strict: true });
  client.preloadHeadwords().catch(() => {});

  const server = createMcpServer({ client });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
