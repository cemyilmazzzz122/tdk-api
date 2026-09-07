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
  "sin", "sın", "sun", "sün", "siz", "sız", "suz", "süz", "lik", "lık", "luk", "lük",
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

  let frontier = [normalized];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier: string[] = [];

    for (const current of frontier) {
      for (const suffix of TURKISH_SUFFIXES) {
        if (current.length - suffix.length >= minStemLength && current.endsWith(suffix)) {
          const stem = current.slice(0, -suffix.length);

          const hardened = restoreConsonantSoftening(stem);
          const vowelDropped = restoreVowelDrop(stem);
          // Infinitives only apply to direct stems or consonant-hardened stems (e.g. gid -> git -> gitmek),
          // NOT to vowel-dropped nouns (nouns like akıl/omuz/şehir don't take infinitive -mek/-mak).
          const verbalBases = [stem, ...hardened];
          const infinitives = verbalBases.flatMap((v) => restoreInfinitive(v));
          const variants = [stem, ...hardened, ...vowelDropped, ...infinitives];

          for (const variant of variants) {
            if (!seen.has(variant) && variant !== normalized) {
              seen.add(variant);
              nextFrontier.push(variant);
              candidatesWithWeight.push({ candidate: variant, baseLength: stem.length });
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
