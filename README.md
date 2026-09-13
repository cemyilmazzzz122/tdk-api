# TDK API Node.js Wrapper

Bu proje, Türk Dil Kurumu (TDK) sözlük verilerine Node.js ortamından doğrudan, hızlı ve güvenilir bir şekilde erişim sağlamak amacıyla geliştirilmiş, TypeScript tabanlı resmî olmayan bir sarmalayıcı (wrapper) kütüphanedir. İkili (binary) dosya veya kurulum sonrası indirme gerektirmez; sözlük çekirdeği yalnızca Node.js'in yerleşik `fetch`/`https` modülleriyle HTTP üzerinden güncel verileri çeker (MCP sunucusu için `@modelcontextprotocol/sdk` ve `zod` paketle birlikte gelir). Kütüphanenin yanı sıra bir terminal CLI'si (`tdk`) ve dahili bir **Model Context Protocol (MCP)** sunucusu da paketle birlikte gelir.

## Kurulum

Projeyi Node.js projenize dahil etmek için aşağıdaki paket yöneticilerinden uygun olanı kullanabilirsiniz:

```bash
npm install tdk-api-wrapper
```
veya global yükleyerek komut satırı aracını (CLI) kullanmak için:
```bash
npm install -g tdk-api-wrapper
```

## Komut Satırı Arayüzü (CLI) Kullanımı

Paketi global kurduğunuzda, `tdk` komutunu terminalinizden doğrudan kullanabilirsiniz. Çıktılar olabildiğince sade ve okunabilirdir.

```bash
tdk ara kalem
tdk ornek araba
tdk koken lisan
tdk hece muvaffakiyet
tdk uyum elma
tdk kucukuyum armut
tdk yazim herkes
tdk kok halılarımızın
tdk deyim göz
tdk gunun
tdk rastgele
tdk esanlam güzel
tdk karsit kötü
tdk yabanci kalem
tdk kurallar
tdk kural kısaltmalar
tdk karsilastir kalem kağıt
tdk analiz "Bu güzel kalem masanın üstünde duruyor"
tdk oneri kale
tdk bulmaca k_l_m
tdk anagram kalem
tdk kafiye bahar
tdk denetle "Bugün evde kaldım ama sen gelmedinki"
tdk repl
tdk kubbealti merhaba
tdk nisanyan merhaba
tdk viki merhaba
tdk mcp                    # MCP (Model Context Protocol) stdio sunucusunu başlatır
```

Herhangi bir komuta `--json` bayrağı eklendiğinde çıktı, insan-okunur metin yerine tek satırlık JSON olarak basılır (script/otomasyon kullanımı için):

```bash
tdk ara kalem --json
# ["Yazma, çizme vb. işlerde kullanılan çeşitli biçimlerde araç", ...]
```

Argümansız `tdk` veya `tdk repl` çalıştırıldığında interaktif sözlük kabuğu açılır. Kabuk açılırken madde listesini arka planda yükler; kelime yazarken **Tab** tuşu TDK maddeleri üzerinden anında otomatik tamamlama yapar.

CLI ve MCP sunucusu, TDK'nin ~81 bin kelimelik madde listesini (`oneri`, `yazim`, `bulmaca`, `anagram`, `kafiye`, `denetle` bunu kullanır; 7 gün geçerli) ve bulunan kelime kayıtlarını (30 gün geçerli) `~/.cache/tdk-api-wrapper/` altında diskte önbelleğe alır; böylece sonraki çalıştırmalar aynı veriyi yeniden indirmez. Kapatmak için `TDK_DISK_CACHE=0` ortam değişkenini verin.

`tdk oneri kagit` gibi Türkçe harfsiz yazılan önekler de (`kâğıt`, `kâğıt ağacı` …) bulunur; `tdk koken kitaplarımız` çekimli kelimelerde kökün kökenini gösterir. Bir kaynak boş döndüğünde nedenini görmek için `TDK_DEBUG=1` verin (yutulan ağ/scraping hataları stderr'e yazılır).

## Kullanım Başlangıcı

Modülü projenize dahil edip TDK sınıfını kullanarak tüm işlemleri başlatabilirsiniz. CommonJS ve ECMAScript Modules (ESM) yapıları tam olarak desteklenmektedir.

```typescript
import { TDK, TDKClient } from 'tdk-api-wrapper';

// Ağ gecikmesi, yeniden deneme ve bellek içi önbelleği yapılandırma
TDK.configure({
  timeoutMs: 8000,   // İstek başına zaman aşımı, gövde indirmesi dahil (varsayılan: 8000ms)
  retries: 1,        // 5xx ve ağ hatalarında otomatik tekrar (varsayılan: 1)
  cache: true,       // Bellek içi önbelleği aktif etme
  maxCacheSize: 1000, // Maksimum önbellek boyutu (LRU: en uzun süredir kullanılmayan kayıt atılır)
  concurrency: 4,    // Toplu metotlarda aynı anda en fazla istek (varsayılan: 4)
  diskCache: true,    // Madde listesini ve kelime kayıtlarını diske yaz (varsayılan: false)
  // diskCacheDir: '/özel/dizin' // Varsayılan: $XDG_CACHE_HOME veya ~/.cache altında tdk-api-wrapper
  strict: false,     // true: null/[] dönen metotlar ağ/scraping hatasında fırlatır (bkz. Hata Yönetimi)
  onError: (e) => console.warn(e.name, e.message), // Yutulan hataları izleme
});

// Bağımsız istemci: kendi yapılandırması ve kendi önbellekleri vardır (multi-tenant/backend için).
// `TDK` de aslında varsayılan bir TDKClient örneğidir; yalnızca herkese açık madde listesi
// örnekler arasında paylaşılır (her istemci ayrı ayrı indirmesin diye).
const client = new TDKClient({ timeoutMs: 5000, cache: true, strict: true });
```

### İptal ve Zaman Aşımı

Ağa çıkan her metot son parametre olarak `{ signal }` kabul eder. Sinyal iptal edilince bekleyen istekler kesilir ve promise, sinyalin nedeniyle (`AbortError`) reddedilir; bu, normalde `null`/`[]` dönen metotlar için de geçerlidir. Yazdıkça arama yapan arayüzlerde eski istekleri iptal etmek için idealdir:

```typescript
let controller: AbortController | undefined;

async function onInput(text: string) {
  controller?.abort();
  controller = new AbortController();
  try {
    const meanings = await TDK.getMeanings(text, { signal: controller.signal });
    render(meanings);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw e;
  }
}
```

## API Referansı ve Fonksiyonlar

Aşağıdaki metotların hepsi varsayılan `TDK` örneği veya kendi oluşturduğunuz bir `TDKClient` üzerinden çağrılabilir. Ağa çıkan her metot son parametre olarak `{ signal }` da kabul eder:

### 1. Temel Arama ve Anlamlar
- **`TDK.getWord(word)`**: Kelimenin TDK sözlüğündeki tüm yapısal özelliklerini tam veri seti (JSON) olarak getirir.
- **`TDK.getMeanings(word)`**: Sadece anlamları basit bir string dizisi olarak döner.
- **`TDK.getWordsBatch(wordsArray)`**: Birden fazla kelimeyi sınırlı eşzamanlılıkla (`concurrency`, varsayılan 4) arar. Tekrarlanan kelimeler tek istekle çekilir, sonuçlar girdi sırasını korur, bulunamayan ya da hata veren kelime için `[]` döner.

### 2. Dilbilgisi ve Gramer Özellikleri
- **`TDK.syllabicate(word)`**: Kelimeyi Türkçe heceleme kurallarına göre doğru hecelerine ayırır (Örn: `['mu', 'vaf', 'fa', 'ki', 'yet']`, `['e', 'lek', 'trik']`, `['kon', 'trol']`).
- **`TDK.checkVowelHarmony(word)`**: Kelimenin büyük ünlü uyumuna uyup uymadığını (boolean) kontrol eder.
- **`TDK.checkLabialHarmony(word)`**: Kelimenin küçük ünlü uyumuna (düzlük-yuvarlaklık uyumu) uyup uymadığını (boolean) kontrol eder.
- **`TDK.getPartOfSpeech(word)`**: Kelimenin sözcük türünü (isim, sıfat, zarf vb.) döndürür.
- **`TDK.checkSpelling(word)`**: Kelimenin doğru yazılıp yazılmadığını kontrol eder. Önce TDK'de doğrudan arar; bulamazsa kütüphanenin dahili sık yapılan yanlışlar listesini (`COMMON_MISSPELLINGS` — [referans liste](https://gist.github.com/cemyilmazzzz122/e4bdd509fe9b03a3070a685ab603aaa8)) kontrol eder. Ardından **morfolojik ek sıyırma (stemming) motoru** devreye girer; kelime çekimli bir biçimse (`halılarımızın`, `kitabımız`, `çocuğa`, `okuyoruz`, `hakkımızda`, `başlıyor`) kökünü tespit edip `{ isCorrect: true, isInflected: true, root: "..." }` döner. Son aşamada ise TDK'nin ~81 bin kelimelik tam madde listesi üzerinde **klavye ve düzeltme işareti farkındalıklı** bir Damerau-Levenshtein edit-distance ile en yakın kelimeyi önerir: Türkçe Q klavyede yan yana duran tuşlar (`arabs` → `araba`, `swlam` → `selam`) ve ASCII/Türkçe harf ikilileri (`ı/i`, `ş/s`, `ö/o` …) tam bir düzeltme yerine bir düzeltmenin küçük bir kesri kadar sayılır. Ayrıca günlük Türkçede sık geçen kelimeler, aynı mesafedeki nadir maddelere tercih edilir (kelime sıklığı verisi); böylece hem en yakın hem de en olası madde kazanır (`yanlız` → `yalnız`, `eksoz` → `egzoz`).
- **`TDK.getCompoundWords(word)`**: Aranan kelime ile oluşturulmuş birleşik kelimeleri (Örn: dolma kalem) listeler.

### 3. Morfoloji ve Kök Bulma (Morphology Engine)
- **`TDK.findRoot(word)`**: Çekimli veya ek almış bir kelimenin TDK sözlüğündeki yalın kökünü/maddesini bulur (`"halılarımızın"` → `"halı"`, `"kitabımız"` → `"kitap"`, `"çocuğa"` → `"çocuk"`, `"şehre"` → `"şehir"`, `"okuyoruz"` → `"okumak"`, `"hakkımızda"` → `"hak"`, `"başlıyor"` → `"başlamak"`, `"diyor"` → `"demek"`, `"gitsen"` → `"gitmek"`). Aşamalı ek sıyırma (BFS), ünsüz yumuşaması, ünsüz ikizleşmesi (türemesi), ünlü daralması onarımı ve mastar onarımı uygular. Kök bulunamazsa `null` döner.
- **`TDK.stem(word)`**: Kelime üzerinde morfolojik analiz yaparak `{ word, root, isInflected, candidates }` nesnesi döndürür.
- **`TDK.getStemCandidates(word)`**: Kelimeden Türkçe ek sıyırma kurallarıyla türetilen tüm aday kökleri öncelik sırasıyla string dizisi olarak üretir (saf fonksiyon, ağ isteği atmaz).
- **`TDK.isHeadword(word)`**: Kelimenin TDK'de kayıtlı bir sözlük maddesi olup olmadığını kontrol eder (hafızadaki 81 binlik set üzerinden anında $O(1)$ kontrol).

### 4. Metin Redaksiyon ve İmla Denetimi (Proofreading)
- **`TDK.proofread(text)`**: Verilen Türkçe metindeki imla hatalarını, yanlış bitişik yazılan bağlaçları (`da/de`, `ki`) ve soru eklerini (`mi/mı/mu/mü`) cümle düzeyinde tespit edip hata türü, metin konumu (offset) ve önerisiyle birlikte `{ text, issues, isCorrect }` döner:
  - **`da/de` bağlacı**: Fiillerden sonra yanlışlıkla bitişik yazılan durumları yakalar (`gitsende` → `gitsen de`).
  - **`ki` bağlacı**: Fiillerden sonra bitişik yazılan durumları yakalar (`gördümki` → `gördüm ki`), kalıplaşmış **SOMBAHÇEMİ** (*sanki, oysaki, mademki, belki, halbuki, çünkü, meğerki, illaki*) istisnalarını korur.
  - **`mi/mı/mu/mü` soru eki**: Kelimeye bitişik yazılan soru eklerini yakalar (`yaptınmı` → `yaptın mı`).
  - **Genel imla denetimi**: Sözlükte bulunamayan hatalı kelimeler için en yakın TDK önerisini sunar.

### 5. Dilbilimsel Arama Araçları
- **`TDK.patternSearch(pattern, options?)`**: Bulmaca ve maskeli arama desteği. `_` veya `?` tek harf jokerini, `*` ise çoklu harf jokerini temsil eder (`TDK.patternSearch("k_l_m")` → `["kalem", "kelam", "kilim"]`, `TDK.patternSearch("*istan")` → `["gülistan", "kabristan", ...]`).
- **`TDK.findAnagrams(letters, options?)`**: Verilen harflerle yazılabilecek Türkçe TDK kelimelerini döner (`TDK.findAnagrams("kalem")` → `["emlak", "kelam", "kemal"]`).
- **`TDK.findRhymes(word, options?)`**: Aranan kelimeyle kafiyeli (son heceleri/harfleri eşleşen) kelimeleri listeler (`TDK.findRhymes("bahar")` → `["ilkbahar", "sonbahar", "buhar", ...]`).

### 6. Edebi ve Kültürel Analiz
- **`TDK.getExamples(word)`**: Ünlü yazarlardan edebi örnek cümleleri ve yazar isimlerini liste halinde döner.
- **`TDK.getOrigin(word, fallbackStem?)`**: Kelimenin hangi dilden geldiğini (etimolojik lisan kökenini) döner; kelime hiç bulunamazsa `null` döner, bulunup köken kaydı yoksa `"Türkçe"` döner. İkinci parametre `true` verilirse sözlükte olmayan çekimli kelimelerde kökün etimolojisine bakar (`TDK.getOrigin("kitaplarımız", true)` → `"Arapça kitāb"`).
- **`TDK.getProverbs(word)`**: Yalnızca aranan kelimenin geçtiği atasözü ve deyimleri dizi olarak getirir.
- **`TDK.isForeignWord(word)`**: Kelimenin yabancı kökenli olup olmadığını `boolean` olarak döner; kelime bulunamazsa `null` döner.
- **`TDK.groupByOrigin(words)`**: Bir kelime listesini etimolojik kökenlerine göre gruplar (bulunamayanlar `"Bilinmiyor"` altında toplanır).
- **`TDK.getSynonyms(word)`** / **`TDK.getAntonyms(word)`**: Kelimenin eş/zıt anlamlılarını döner (undocumented `gts-yeni` endpoint'i üzerinden; sonuç bulunamazsa `[]`).
- **`TDK.compareWords(a, b)`**: İki kelimeyi anlam sayısı, köken, hece bölünüşü, büyük ve küçük ünlü uyumu açısından yan yana karşılaştırır.
- **`TDK.analyzeText(text)`**: Bir metindeki (Türkçe bağlaçlar/edatlar hariç) her benzersiz kelimeyi sınırlı eşzamanlılıkla arayıp ilk anlamını, kökenini ve varsa kökünü döner. Çekimli kelimeleri morfoloji motoruyla otomatik tespit edip kökleriyle (`isInflected: true, root: "..."`) birlikte analiz eder.

### 7. Yardımcı Metotlar
- **`TDK.getSuggestions(prefix, limit = 10, options?)`**: TDK'nin ~81 bin kelimelik tam madde listesi üzerinden önek bazlı otomatik tamamlama önerilerini Türk alfabesi sırasıyla döner. İlk çağrıda listeyi indirip önbelleğe alır; aramalar Türkçe sıralı bir önek indeksinde ikili arama (binary search) ile yapıldığı için sonraki çağrılar mikrosaniyeler sürer. Aynı anda gelen çağrılar tek bir indirmeyi paylaşır. `{ foldDiacritics: true }` verilirse birebir eşleşmeler `limit`'i doldurmadığında Türkçe harf ve şapka farkını yok sayan eşleşmelerle tamamlar (`TDK.getSuggestions("kagit", 5, { foldDiacritics: true })` → `["kâğıt", "kâğıt ağacı", …]`); birebir eşleşmeler her zaman önce gelir.
- **`TDK.getInstantSuggestions(prefix, limit = 10, options?)`**: `getSuggestions()`'ın senkron hâli (aynı `foldDiacritics` seçeneğiyle). Liste bellekte değilse ağa gitmez, `[]` döner. Yazdıkça öneri gösteren arayüzler (REPL, TUI, editör eklentisi) içindir.
- **`TDK.preloadHeadwords()`**: Madde listesini önceden yükler (örn. uygulama açılışında), böylece ilk öneri de anında gelir. Liste yüklendiyse `true` döner.
- **`TDK.clearDiskCache()`**: `diskCache` açıkken diske yazılan madde listesini ve kelime kayıtlarını siler (dizindeki başka dosyalara dokunmaz). Madde listesinin önbellek katmanları sırasıyla: bellek → disk (7 gün geçerli) → ağ; ağ hatasında süresi geçmiş disk kopyası kullanılır. `getWord()` bulunan kayıtları 30 gün diskte tutar (bulunamayanlar yazılmaz). `clearCache()` yalnızca belleği temizler.
- **`TDK.getAudioUrl(word)`**: TDK'nin bu kelime için gerçekten bir ses kaydı varsa doğrudan indirme URL'sini döner, yoksa `null`. `downloadAudio(word, destPath)` ile cihazınıza indirebilirsiniz.
- **`TDK.getDailyContent()`**: TDK anasayfasında yer alan "Günün Kelimesi, Atasözü ve Kuralı" içeriklerini çeker.
- **`TDK.getWordOfTheDay()`**: `getDailyContent()`'in üzerine ince bir katman; günün kelimesini ve tüm anlamlarını `{ word, meanings }` şeklinde döner.
- **`TDK.getRandomWord()`**: Günün içeriğindeki kelime ve atasözü havuzundan rastgele bir tanesini `{ type: "kelime" | "atasoz", madde, anlam }` şeklinde seçer (not: tüm sözlük değil, sadece o günkü içerik havuzundan seçim yapar).
- **`TDK.getKurallar()`**: TDK'nin `/icerik` akışının o an döndürdüğü yazım kuralı sayfa(lar)ını `{ adi, url }` şeklinde listeler.
- **`TDK.getRule(name)`**: Adı verilen yazım kuralının tam metnini `tdk.gov.tr`'den çeker.

### 8. Diğer Sözlük Kaynakları

TDK dışındaki bu üç kaynak da her zaman kullanılabilir/dokümante edilmiş resmî API'ler değildir; her biri **fragile scraping** (kırılgan, dokümante edilmemiş entegrasyon) — kaynak taraflarında bir değişiklik olursa `null`/`[]` dönerler, hataya düşmezler. Verinin telif/kullanım koşulları kaynağa göre farklıdır: Wiktionary içeriği CC BY-SA lisanslıdır (açık); Nişanyan Sözlük ücretsiz, açık bir kişisel/akademik kaynaktır; **Kubbealtı Lugatı ise ticari bir sözlük ürünüdür** — bu kütüphane onu da dokümante edilmemiş bir uç noktadan çekebiliyor olsa da, kullanımınızı Kubbealtı'nın kendi kullanım şartlarına göre değerlendirmeniz önerilir.

- **`TDK.getKubbealti(word)`**: Kubbealtı Lugatı'nın ("Misalli Büyük Türkçe Sözlük") verilerini `{ kelime, anlam }` dizisi olarak döner (`anlam` zengin tipografi içeren ham HTML'dir). `getKubbealtiMeanings(word)` aynı veriyi düz metne çevirir. `getKubbealtiSuggestions(prefix)` Kubbealtı'nın kendi otomatik tamamlama uç noktasını kullanır (TDK'nin `getSuggestions()`'ından bağımsız, ayrı bir veri kaynağı). Kubbealtı başlıkları klasik Türkçe imlayla (ü/ö/ç/ğ/ş, düzeltme işareti) indekslidir; düz ASCII'ye yakın bir sorgu (örn. `ruzgar`) boş dönerse, kütüphane tek harflik Türkçeleştirme varyasyonlarını (`rüzgâr`, `rûzgar` vb.) otomatik dener. Not: Kubbealtı'nın veri sunucusu (`eski.lugatim.com`) sertifika zincirini eksik gönderiyor; bu kütüphane eksik ara sertifikaları ekleyerek zinciri düzgün doğruluyor (doğrulamayı kapatmıyor) — Let's Encrypt bu ara sertifikayı döndürürse bu entegrasyon `null` dönmeye başlar.
- **`TDK.getNisanyan(word)`**: Nişanyan Sözlük'ten kelimenin etimoloji paragrafını düz metin olarak döner; kelime bulunamazsa `null`.
- **`TDK.getWiktionary(word)`**: Türkçe Vikisözlük'ten (`tr.wiktionary.org`) resmî MediaWiki API'si (`action=query&prop=extracts`) üzerinden veri çeker — bu üçü arasında scraping olmayan, resmî ve en kararlı olanı. `{ raw, sections }` döner; `sections` metni `== Köken ==`, `=== Söyleniş ===` gibi başlıklara göre bir sözlüğe ayırır. `getWiktionarySection(word, sectionName)` tek bir bölümü (örn. `"Köken"`) büyük/küçük harf duyarsız süzer. Bu wiki'de başlık büyütme kapalı (`$wgCapitalLinks=false` — "Türkiye" ile bir küçük harfli kelime ayrı sayfalardır), o yüzden `TDK.getWiktionary("türkiye")` gibi tam eşleşmeyen aramalar otomatik olarak ilk harfi (Türkçe kurallarına göre, örn. `istanbul` → `İstanbul`) büyütülmüş hâliyle tekrar denenir.

## Model Context Protocol (MCP) Sunucusu

Paket, bir MCP stdio sunucusu içerir; böylece TDK sözlük, morfoloji, yazım denetimi ve etimoloji araçlarını Claude Desktop, Cursor, Antigravity veya herhangi bir MCP istemcisine yalnızca Node.js ile bağlayabilirsiniz — Python ya da ek bir çalışma zamanı gerekmez.

```json
{
  "mcpServers": {
    "tdk": {
      "command": "npx",
      "args": ["-y", "tdk-api-wrapper", "mcp"]
    }
  }
}
```

Global kuruluysa `tdk mcp` (veya `tdk-mcp`) komutu da aynı sunucuyu başlatır. Sunucu programatik olarak da gömülebilir; araçlar isteğe bağlı olarak kendi `TDKClient` örneğinizi kullanır:

```typescript
import { createMcpServer, runMcpServer } from 'tdk-api-wrapper/mcp';
import { TDKClient } from 'tdk-api-wrapper';

const server = createMcpServer({ client: new TDKClient({ cache: true, strict: true }) });
```

`createMcpServer` / `runMcpServer` ana girişten (`tdk-api-wrapper`) de hâlâ dışa aktarılıyor ancak bu kullanım eskidi (deprecated) ve 2.0'da kaldırılacak; böylece yalnızca sözlük kullananlar MCP bağımlılıklarını yüklemeyecek.

Sunulan araçlar: `tdk_lookup`, `tdk_meanings`, `tdk_examples`, `tdk_proverbs`, `tdk_compound_words`, `tdk_part_of_speech`, `tdk_synonyms`, `tdk_antonyms`, `tdk_origin`, `tdk_nisanyan`, `tdk_kubbealti`, `tdk_wiktionary`, `tdk_spell_check`, `tdk_proofread`, `tdk_stem`, `tdk_analyze_text`, `tdk_syllables`, `tdk_vowel_harmony`, `tdk_autocomplete`, `tdk_pattern_search`, `tdk_anagram`, `tdk_rhymes`, `tdk_compare`, `tdk_audio_url`, `tdk_word_of_the_day`, `tdk_random_word`, `tdk_rules`. `tdk_autocomplete` isteğe bağlı `max_results` (1–100) ve `fold_diacritics` (varsayılan `true`: Türkçe harfsiz önekleri de eşleştirir) parametrelerini, `tdk_origin` ise `fallback_stem` (varsayılan `true`) parametresini alır. `tdk mcp` sunucusu açılışta madde listesini arka planda yükler, diskte önbelleğe alır ve katı (strict) modda çalışır: "bulunamadı" ile "kaynağa ulaşılamadı" ayrı raporlanır. Her araç JSON metin döndürür; ağ/scraping hataları fırlatmak yerine `isError: true` ile `{ "error": ... }` olarak döner.

## Hata Yönetimi

Kütüphane, ayırt edilebilir hata sınıfları fırlatır (hepsi `TDKError` ve `Error`'dan türer):

- **`TDKValidationError`**: Boş kelime gibi geçersiz bir parametre verildiğinde.
- **`TDKNetworkError`**: Ağ isteği başarısız olduğunda, zaman aşımına uğradığında, sunucu HTTP hata kodu döndüğünde veya cevap JSON olarak parse edilemediğinde (`status` ve `cause` alanlarını taşır).
- **`TDKParseError`**: Kaynak cevap verdiği hâlde içeriği kütüphanenin beklediği biçimde olmadığında (örn. TDK JS paketi artık madde listesini içermiyorsa). Genellikle kaynağın değiştiği ve kütüphanenin güncellenmesi gerektiği anlamına gelir.

`getWord()` ve ondan türeyen metotlar bu hataları her zaman fırlatır. Kırılgan kaynaklara dayanan metotlar (`getSuggestions`, `getDailyContent`, `getSynonyms`, `getKubbealti`, `getNisanyan`, `getWiktionary` …) ise varsayılan olarak hata yerine `null`/`[]` döner; bu yüzden "bulunamadı" ile "kaynağa ulaşılamadı" aynı görünür. Ayırt etmek için:

- `strict: true` ile bu metotlar da hata fırlatır ("bulunamadı" yine `null`/`[]` döner).
- `onError` kancası, strict olmayan istemcide yutulan her hatayla çağrılır.
- `TDK_DEBUG=1` ortam değişkeni yutulan hataları stderr'e yazar.

```typescript
import { TDK, TDKValidationError, TDKNetworkError } from 'tdk-api-wrapper';

try {
  await TDK.getWord('');
} catch (e) {
  if (e instanceof TDKValidationError) {
    console.log('Geçersiz girdi:', e.message);
  } else if (e instanceof TDKNetworkError) {
    console.log('Ağ hatası:', e.message, e.status);
  }
}
```

## Geliştirme ve Testler

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsup: dist/index, dist/mcp, dist/cli (cjs + esm + d.ts)
npm test            # Çevrimdışı birim testleri (ağ gerektirmez, sahte fetch ile)
npm run test:live   # Canlı kaynaklara karşı testler (TDK, Kubbealtı, Nişanyan, Wiktionary)
```

`npm test` her `main` push'unda yayından önce CI'da çalışır; kırık bir sürüm npm'e gitmez. Canlı kaynak testleri haftalık zamanlanmış bir iş olarak da çalışır, böylece scraping yapılan bir kaynak değiştiğinde bu sessiz boş sonuçlar yerine başarısız bir CI koşusu olarak görünür.

## Lisans

Bu proje GNU General Public License v3.0 (or later) ile lisanslanmıştır. Kullanım hakları ve kısıtlamalar için kaynak kod içerisindeki [LICENSE](./LICENSE) dosyasını inceleyebilirsiniz.

Yazım önerilerinde kullanılan kelime sıklığı verisi (`src/data/word-frequency.ts`), Hermit Dave'in [FrequencyWords](https://github.com/hermitdave/FrequencyWords) projesinin OpenSubtitles 2018 Türkçe listesinden türetilmiştir ve [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) lisansı altındadır; türetilmiş veri de aynı lisansla paylaşılır.
