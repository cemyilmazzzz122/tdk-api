/**
 * Turkish Morphology Engine & Stem Candidate Generator.
 *
 * Implements heuristic-based progressive suffix stripping (BFS) with:
 * 1. Comprehensive Turkish suffix catalogue (inflectional, derivational, composite)
 * 2. Reverse consonant mutation (ünsüz yumuşaması / sertleşmesi: b->p, c->ç, d->t, ğ->k, g->k)
 * 3. Reverse vowel drop (ünlü düşmesi: akl->akıl, şehr->şehir, omz->omuz)
 * 4. Infinitive restoration (-mek / -mak for verbal stems)
 * 5. Apostrophe stripping for proper nouns (İstanbul'da -> İstanbul)
 */

export const TURKISH_VOWELS = "aeıioöuü";

export function isVowel(ch: string): boolean {
  return TURKISH_VOWELS.includes(ch);
}

/**
 * Turkish suffixes ordered strictly by descending length so that longer
 * composite suffixes match before their individual subcomponents.
 */
export const TURKISH_SUFFIXES: readonly string[] = [
  // 9-letter composite suffixes
  "lerimizden", "larımızdan", "lerinizden", "larınızdan",
  // 8-letter composite suffixes
  "lerinin", "larının", "lerinde", "larında", "lerinden", "larından",
  "leriyle", "larıyla", "lerini", "larını", "lerimize", "larımıza",
  "lerimizle", "larımızla", "lerinizin", "larınızın", "lerinizde", "larınızda",
  "dığından", "diğinden", "duğundan", "düğünden", "tığından", "tiğinden", "tuğundan", "tüğünden",
  // 7-letter composite suffixes
  "ecektir", "acaktır", "eceğim", "acağım", "eceksin", "acaksın",
  "eceğiz", "acağız", "lerimiz", "larımız", "leriniz", "larınız",
  "umuzdan", "ümüzden", "inizden", "ınızdan", "ünüzden",
  "dığında", "diğinde", "duğunda", "düğünde", "tığında", "tiğinde", "tuğunda", "tüğünde",
  "masına", "mesine", "ıyorsunuz", "iyorsunuz", "uyorsunuz", "üyorsunuz", "yorsunuz",
  // 6-letter composite suffixes
  "iyorsa", "iyorduk", "iyordu", "iyormuş", "ıyorsa", "ıyorduk", "ıyordu", "ıyormuş",
  "uyorsa", "uyorduk", "uyordu", "uyormuş", "üyorsa", "üyorduk", "üyordu", "üyormuş",
  "ıyorsun", "iyorsun", "uyorsun", "üyorsun", "ıyorlar", "iyorlar", "uyorlar", "üyorlar",
  "iyoruz", "ıyoruz", "uyoruz", "üyoruz",
  "imizin", "ımızın", "umuzun", "ümüzün", "imizde", "ımızda", "umuzda", "ümüzde",
  "imizden", "ımızdan", "imizle", "ımızla", "umuzla", "ümüzle",
  "lerdir", "lardır", "muştur", "miştir", "muştur", "müştür",
  "lerden", "lardan", "lerine", "larına", "leriyle", "larıyla",
  "seniz", "sanız", "diniz", "dınız", "dunuz", "dünüz", "tiniz", "tınız", "tunuz", "tünüz",
  "siniz", "sınız", "sunuz", "sünüz",
  "dıkça", "dikçe", "dukça", "dükçe", "tıkça", "tikçe", "tukça", "tükçe",
  "ırken", "irken", "urken", "ürken", "arken", "erken",
  // 5-letter suffixes
  "lerde", "larda", "lerle", "larla", "lerin", "ların", "lerim", "larım",
  "dirler", "dırlar", "dürler", "durlar", "tirler", "tırlar", "türler", "turlar",
  "siniz", "sınız", "sunuz", "sünüz", "yorum", "yorsun", "uyoruz", "yorsunuz", "yorlar",
  "eceks", "acaks", "eyim", "ayım",
  "indik", "ındık", "unduk", "ündük", "ildik", "ıldık", "ulduk", "üldük",
  "meden", "madan", "yınız", "yiniz", "yunuz", "yünüz",
  // 4-letter suffixes
  "imiz", "ımız", "umuz", "ümüz", "iniz", "ınız", "unuz", "ünüz",
  "leri", "ları", "idir", "ıdır", "udur", "üdür", "ecek", "acak",
  "erek", "arak", "ince", "ınca", "unca", "ünce", "ken",
  "meli", "malı", "iyor", "ıyor", "uyor", "üyor",
  "mişti", "mıştı", "muştu", "müştü", "seydi", "saydı",
  "ydim", "ydım", "ydum", "ydüm", "tiler", "tılar", "diler", "dılar",
  "ikten", "ıktan", "uktan", "ükten",
  // 3-letter suffixes
  "ler", "lar", "den", "dan", "ten", "tan", "dir", "dır", "dur", "dür",
  "tir", "tır", "tur", "tür", "nin", "nın", "nun", "nün", "yle", "yla",
  "miş", "mış", "muş", "müş", "dim", "dım", "dum", "düm", "tim", "tım", "tum", "tüm",
  "din", "dın", "dun", "dün", "tin", "tın", "tun", "tün", "dik", "dık", "duk", "dük",
  "tik", "tık", "tuk", "tük", "ydi", "ydı", "ydu", "ydü", "yim", "yım", "yum", "yüm",
  "sin", "sın", "sun", "sün", "sen", "san", "sem", "sam", "sek", "sak",
  "siz", "sız", "suz", "süz", "lik", "lık", "luk", "lük",
  "ici", "ıcı", "ucu", "ücü", "gen", "gan", "ken", "kan",
  "len", "lan", "leş", "laş", "mek", "mak", "yor",
  // 2-letter suffixes
  "de", "da", "te", "ta", "im", "ım", "um", "üm", "in", "ın", "un", "ün",
  "iz", "ız", "uz", "üz",
  "si", "sı", "su", "sü", "ye", "ya", "le", "la", "di", "dı", "du", "dü",
  "ti", "tı", "tu", "tü", "se", "sa", "ce", "ca", "çe", "ça", "me", "ma",
  "ip", "ıp", "up", "üp", "en", "an", "iş", "ış", "uş", "üş",
  "li", "lı", "lu", "lü", "ci", "cı", "cu", "cü", "çi", "çı", "çu", "çü",
  // 1-letter suffixes (vowels / basic case endings)
  "e", "a", "i", "ı", "u", "ü"
];

/**
 * Reverses Turkish consonant softening (ünsüz yumuşaması):
 * When a root ends with p, ç, t, k, it softens to b, c, d, ğ, g before a vowel.
 * This restores the hardened dictionary headword form.
 */
export function restoreConsonantSoftening(stem: string): string[] {
  if (stem.length < 2) return [];
  const last = stem.slice(-1);
  const base = stem.slice(0, -1);
  switch (last) {
    case "b": return [base + "p"];
    case "c": return [base + "ç"];
    case "d": return [base + "t"];
    case "ğ": return [base + "k"];
    case "g": return [base + "k"];
    default: return [];
  }
}

/**
 * Reverses Turkish vowel drop (ünlü düşmesi):
 * In words like akıl->aklım, şehir->şehre, burun->burnu, omuz->omzum,
 * the narrow vowel in the second syllable drops when receiving a vowel-initial suffix.
 * This restores the harmonic dropped vowel between the final consonant cluster.
 */
export function restoreVowelDrop(stem: string): string[] {
  if (stem.length < 3) return [];
  const c1 = stem[stem.length - 2];
  const c2 = stem[stem.length - 1];
  if (!isVowel(c1) && !isVowel(c2)) {
    // Look for the last vowel prior to the cluster
    const vowelsInBase = stem.slice(0, -2).split("").filter(isVowel);
    if (vowelsInBase.length > 0) {
      const lastVowel = vowelsInBase[vowelsInBase.length - 1];
      let inserted = "i";
      if ("aı".includes(lastVowel)) inserted = "ı";
      else if ("ei".includes(lastVowel)) inserted = "i";
      else if ("ou".includes(lastVowel)) inserted = "u";
      else if ("öü".includes(lastVowel)) inserted = "ü";
      return [stem.slice(0, -1) + inserted + c2];
    }
  }
  return [];
}

/**
 * Reverses Turkish consonant gemination (ünsüz türemesi / ikizleşmesi):
 * In words of Arabic/foreign origin, when receiving a vowel-initial suffix, the final consonant doubles:
 * e.g. hak->hakkı, his->hissi, sır->sırrı, af->affı, ret->reddi, tıp->tıbbı, zam->zammı, hat->hattı.
 * Restores the single consonant form and checks consonant softening on the result (e.g. redd -> red -> ret).
 */
export function restoreGemination(stem: string): string[] {
  if (stem.length < 3) return [];
  const c1 = stem[stem.length - 2];
  const c2 = stem[stem.length - 1];
  if (c1 === c2 && !isVowel(c1)) {
    const single = stem.slice(0, -1);
    const hardened = restoreConsonantSoftening(single);
    return [single, ...hardened];
  }
  return [];
}

/**
 * Reverses Turkish vowel narrowing (ünlü daralması):
 * Verbs ending in wide vowels 'a' or 'e' narrow to 'ı', 'i', 'u', 'ü' before the continuous tense suffix -yor:
 * e.g. başla-yor -> başlıyor, bekle-yor -> bekliyor, özle-yor -> özlüyor, anla-yor -> anlıyor.
 * Also handles irregular monosyllabic verbs: de-yor -> diyor, ye-yor -> yiyor.
 */
export function restoreVowelNarrowing(stem: string): string[] {
  if (stem.length < 2) return [];

  // Irregular monosyllabic verbs
  if (stem === "di") return ["de"];
  if (stem === "yi") return ["ye"];

  const lastChar = stem[stem.length - 1];
  const isLastNarrow = "ıiuü".includes(lastChar);

  // Case 1: stem ends with narrow vowel (e.g. başlı, bekli, özlü, kutlu)
  if (isLastNarrow) {
    const vowelsInBase = stem.slice(0, -1).split("").filter(isVowel);
    const lastVowel = vowelsInBase.length > 0 ? vowelsInBase[vowelsInBase.length - 1] : lastChar;
    const widened = "aıou".includes(lastVowel) ? "a" : "e";
    return [stem.slice(0, -1) + widened];
  }

  // Case 2: stem ends with consonant (e.g. başlıyor stripped by -ıyor -> stem: başl)
  if (!isVowel(lastChar)) {
    const vowelsInBase = stem.split("").filter(isVowel);
    if (vowelsInBase.length > 0) {
      const lastVowel = vowelsInBase[vowelsInBase.length - 1];
      const widened = "aıou".includes(lastVowel) ? "a" : "e";
      return [stem + widened];
    }
  }

  return [];
}

/**
 * Restores verb infinitive headword form (-mek / -mak):
 * Since TDK registers verbs in their infinitive form (e.g. okumak, gelmek, yazmak),
 * conjugated verb stems (e.g. oku, gel, yaz) need -mak/-mek appended according to vowel harmony.
 */
export function restoreInfinitive(stem: string): string[] {
  if (stem.length < 2) return [];
  const vowelsInBase = stem.split("").filter(isVowel);
  if (vowelsInBase.length === 0) return [];
  const lastVowel = vowelsInBase[vowelsInBase.length - 1];
  return "aıou".includes(lastVowel) ? [stem + "mak"] : [stem + "mek"];
}

/**
 * Generates candidate roots for a given Turkish word using progressive BFS suffix stripping,
 * consonant mutation restoration, vowel drop restoration, and infinitive restoration.
 *
 * Candidates are sorted so that longer base stems (less aggressive stripping) are checked first,
 * preventing spurious 2-letter roots from overshadowing genuine headwords.
 *
 * @param word The input word to analyze
 * @param minStemLength Minimum allowed length for candidate stems (default: 2)
 * @param maxDepth Maximum levels of progressive suffix stripping (default: 4)
 * @returns Array of unique candidate roots in prioritized order
 */
export function getStemCandidates(
  word: string,
  minStemLength: number = 2,
  maxDepth: number = 4
): string[] {
  if (!word || word.trim().length === 0) return [];

  const raw = word.trim();
  const normalized = raw.toLocaleLowerCase("tr-TR");

  const candidatesWithWeight: { candidate: string; baseLength: number }[] = [];
  const seen = new Set<string>();

  // If proper noun contains apostrophe (e.g. "İstanbul'da", "Ankara'dan"),
  // the part before the apostrophe is an immediate high-priority candidate.
  if (raw.includes("'") || raw.includes("’")) {
    const apostropheStem = normalized.split(/['’]/)[0];
    if (apostropheStem.length >= minStemLength) {
      candidatesWithWeight.push({ candidate: apostropheStem, baseLength: apostropheStem.length + 10 });
      seen.add(apostropheStem);
    }
  }

  // Bare verb imperative candidates (e.g. "söyle" -> "söylemek", "oku" -> "okumak")
  const bareInfinitives = restoreInfinitive(normalized);
  for (const inf of bareInfinitives) {
    if (!seen.has(inf) && inf !== normalized) {
      seen.add(inf);
      candidatesWithWeight.push({ candidate: inf, baseLength: normalized.length });
    }
  }

  let frontier = [normalized];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier: string[] = [];

    for (const current of frontier) {
      for (const suffix of TURKISH_SUFFIXES) {
        if (current.length - suffix.length >= minStemLength && current.endsWith(suffix)) {
          const stem = current.slice(0, -suffix.length);

          const hardened = restoreConsonantSoftening(stem);
          const vowelDropped = restoreVowelDrop(stem);
          const geminated = restoreGemination(stem);

          // Vowel narrowing (ünlü daralması) in Turkish strictly occurs with continuous tense (-yor)
          // or with the monosyllabic verbs de-/ye- before buffer 'y' (diye, yiyen).
          // Restricting narrowing to these suffixes prevents false-positive stems on other suffixes.
          const isNarrowingSuffix =
            suffix.startsWith("yor") ||
            suffix.includes("iyor") ||
            suffix.includes("ıyor") ||
            suffix.includes("uyor") ||
            suffix.includes("üyor");

          const isDeYeBuffer = (stem === "di" || stem === "yi") && suffix.startsWith("y");
          const narrowed = isNarrowingSuffix || isDeYeBuffer ? restoreVowelNarrowing(stem) : [];

          // Suffix indicator for verbs: -yor, -ecek, -miş, -di, etc.
          const isVerbSuffix =
            isNarrowingSuffix ||
            suffix.includes("ecek") ||
            suffix.includes("acak") ||
            suffix.includes("miş") ||
            suffix.includes("mış") ||
            suffix.includes("müş") ||
            suffix.includes("muş") ||
            suffix.includes("mek") ||
            suffix.includes("mak") ||
            suffix.includes("erek") ||
            suffix.includes("arak") ||
            suffix.includes("dik") ||
            suffix.includes("dık") ||
            suffix.includes("duk") ||
            suffix.includes("dük") ||
            suffix.includes("tik") ||
            suffix.includes("tık") ||
            suffix.includes("tuk") ||
            suffix.includes("tük") ||
            suffix.includes("sen") ||
            suffix.includes("san") ||
            suffix.includes("sem") ||
            suffix.includes("sam") ||
            suffix.includes("sek") ||
            suffix.includes("sak");

          // Infinitives apply to direct stems, hardened stems, and widened stems (e.g. başlı -> başla -> başlamak)
          const verbalBases = [stem, ...hardened, ...narrowed];
          const infinitives = verbalBases.flatMap((v) => restoreInfinitive(v));

          // Base candidates
          const variants = [stem, ...hardened, ...vowelDropped, ...geminated, ...narrowed];

          for (const variant of variants) {
            if (!seen.has(variant) && variant !== normalized) {
              seen.add(variant);
              nextFrontier.push(variant);
              candidatesWithWeight.push({ candidate: variant, baseLength: stem.length });
            }
          }

          // Push infinitives with high priority if a verbal suffix matched, preventing noun false-positives
          for (const inf of infinitives) {
            if (!seen.has(inf) && inf !== normalized) {
              seen.add(inf);
              nextFrontier.push(inf);
              const weight = isVerbSuffix ? stem.length + 5 : stem.length;
              candidatesWithWeight.push({ candidate: inf, baseLength: weight });
            }
          }
        }
      }
    }

    if (nextFrontier.length === 0) break;
    frontier = nextFrontier;
  }

  // Sort candidates by baseLength descending (longer stem = higher priority)
  candidatesWithWeight.sort((a, b) => b.baseLength - a.baseLength);

  return [...new Set(candidatesWithWeight.map((c) => c.candidate))];
}
