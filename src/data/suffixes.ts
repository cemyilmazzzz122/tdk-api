/**
 * Turkish suffix catalogue used by the morphology engine's BFS stem-stripper
 * (see `morphology.ts`). Ordered strictly by descending length so that
 * longer composite suffixes match before their individual subcomponents.
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
  "e", "a", "i", "ı", "u", "ü",
];
