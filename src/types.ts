export interface Author {
  yazar_id: string;
  tam_adi: string;
  kisa_adi: string;
  ekno: string;
}

export interface Example {
  ornek_id: string;
  anlam_id: string;
  ornek_sira: string;
  ornek: string;
  kac: string;
  yazar_id: string;
  yazar_vd: string;
  yazar?: Author[];
}

export interface Feature {
  ozellik_id: string;
  tur: string;
  tam_adi: string;
  kisa_adi: string;
  ekno: string;
}

export interface Meaning {
  anlam_id: string;
  madde_id: string;
  anlam_sira: string;
  fiil: string;
  tipkes: string;
  anlam: string;
  anlam_html: string | null;
  gos: string;
  gos_kelime: string;
  gos_kultur: string;
  orneklerListe?: Example[];
  ozelliklerListe?: Feature[];
}

export interface Proverb {
  madde_id: string;
  madde: string;
  on_taki: string | null;
}

export interface WordInfo {
  madde_id: string;
  kac: string;
  kelime_no: string;
  cesit: string;
  anlam_gor: string;
  on_taki: string | null;
  on_taki_html: string | null;
  madde: string;
  madde_html: string | null;
  cesit_say: string;
  anlam_say: string;
  taki: string;
  cogul_mu: string;
  ozel_mi: string;
  egik_mi: string;
  lisan_kodu: string;
  lisan: string;
  telaffuz_html: string | null;
  telaffuz: string;
  birlesikler: string | null;
  font: string | null;
  madde_duz: string;
  gosterim_tarihi: string | null;
  anlamlarListe?: Meaning[];
  atasozu?: Proverb[];
}

export interface DailyContent {
  kelime: { madde: string; anlam: string }[];
  atasoz: { madde: string; anlam: string }[];
  kural: { adi: string; url: string }[];
  syyd: { id: string; yanliskelime: string; dogrukelime: string }[];
  karistirma: { id: string; yanlis: string; dogru: string }[];
}

export interface SpellCheckResult {
  isCorrect: boolean;
  word: string;
  suggestion?: string;
}

export interface WordOfTheDay {
  word: string;
  meanings: string[];
}

export interface DailyPick {
  type: "kelime" | "atasoz";
  madde: string;
  anlam: string;
}

export interface TDKRule {
  adi: string;
  url: string;
}

export type TDKResponse = WordInfo[] | { error: string };
