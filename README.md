# TDK API Node.js Wrapper

Bu proje, Türk Dil Kurumu (TDK) sözlük verilerine Node.js ortamından doğrudan, hızlı ve güvenilir bir şekilde erişim sağlamak amacıyla geliştirilmiş, TypeScript tabanlı resmî olmayan bir sarmalayıcı (wrapper) kütüphanedir. Herhangi bir dış bağımlılığa veya ikili (binary) dosyaya ihtiyaç duymadan HTTP üzerinden güncel verileri çeker.

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
```

Herhangi bir komuta `--json` bayrağı eklendiğinde çıktı, insan-okunur metin yerine tek satırlık JSON olarak basılır (script/otomasyon kullanımı için):

```bash
tdk ara kalem --json
# ["Yazma, çizme vb. işlerde kullanılan çeşitli biçimlerde araç", ...]
```

Argümansız `tdk` veya `tdk repl` çalıştırıldığında interaktif sözlük kabuğu açılır.

## Kullanım Başlangıcı

Modülü projenize dahil edip TDK sınıfını kullanarak tüm işlemleri başlatabilirsiniz. CommonJS ve ECMAScript Modules (ESM) yapıları tam olarak desteklenmektedir.

```typescript
import { TDK, TDKClient } from 'tdk-api-wrapper';

// Ağ gecikmesi, yeniden deneme ve bellek içi önbelleği yapılandırma
TDK.configure({
  timeoutMs: 8000,   // İstek zaman aşımı (varsayılan: 8000ms)
  retries: 1,        // 5xx ve ağ hatalarında otomatik tekrar (varsayılan: 1)
  cache: true,       // Bellek içi önbelleği aktif etme
  maxCacheSize: 1000 // Maksimum önbellek boyutu (LRU)
});

// İsteğe bağlı: Ayrı yapılandırmaya sahip bağımsız istemci örneği (Multi-tenant/Backend için)
const client = new TDKClient({ timeoutMs: 5000, cache: true });
```

## API Referansı ve Fonksiyonlar

Aşağıdaki metotlar `TDK` sınıfı üzerinden statik olarak veya `TDKClient` örneği üzerinden erişilebilir durumdadır:

### 1. Temel Arama ve Anlamlar
- **`TDK.getWord(word)`**: Kelimenin TDK sözlüğündeki tüm yapısal özelliklerini tam veri seti (JSON) olarak getirir.
- **`TDK.getMeanings(word)`**: Sadece anlamları basit bir string dizisi olarak döner.
- **`TDK.getWordsBatch(wordsArray)`**: Birden fazla kelimeyi aynı anda aramak için kullanılır (sunucuyu yormamak adına yerleşik gecikme içerir).

### 2. Dilbilgisi ve Gramer Özellikleri
- **`TDK.syllabicate(word)`**: Kelimeyi Türkçe heceleme kurallarına göre doğru hecelerine ayırır (Örn: `['mu', 'vaf', 'fa', 'ki', 'yet']`, `['e', 'lek', 'trik']`, `['kon', 'trol']`).
- **`TDK.checkVowelHarmony(word)`**: Kelimenin büyük ünlü uyumuna uyup uymadığını (boolean) kontrol eder.
- **`TDK.checkLabialHarmony(word)`**: Kelimenin küçük ünlü uyumuna (düzlük-yuvarlaklık uyumu) uyup uymadığını (boolean) kontrol eder.
- **`TDK.getPartOfSpeech(word)`**: Kelimenin sözcük türünü (isim, sıfat, zarf vb.) döndürür.
- **`TDK.checkSpelling(word)`**: Kelimenin doğru yazılıp yazılmadığını kontrol eder. Önce TDK'de doğrudan arar; bulamazsa TDK'nin "sık yapılan yanlışlar" listesini kontrol eder. Ardından **morfolojik ek sıyırma (stemming) motoru** devreye girer; kelime çekimli bir biçimse (`halılarımızın`, `kitabımız`, `çocuğa`, `okuyoruz`, `hakkımızda`, `başlıyor`) kökünü tespit edip `{ isCorrect: true, isInflected: true, root: "..." }` döner. Son aşamada ise TDK'nin ~81 bin kelimelik tam madde listesi üzerinde **klavye ve düzeltme işareti farkındalıklı** bir Damerau-Levenshtein edit-distance ile en yakın kelimeyi önerir: Türkçe Q klavyede yan yana duran tuşlar (`arabs` → `araba`, `swlam` → `selam`) ve ASCII/Türkçe harf ikilileri (`ı/i`, `ş/s`, `ö/o` …) tam bir düzeltme yerine bir düzeltmenin küçük bir kesri kadar sayılır; böylece hem en yakın hem de en olası madde kazanır (`yanlız` → `yalnız`).
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
- **`TDK.getOrigin(word, fallbackStem?)`**: Kelimenin hangi dilden geldiğini (etimolojik lisan kökenini) döner; kelime hiç bulunamazsa `null` döner, bulunup köken kaydı yoksa `"Türkçe"` döner. İsteğe bağlı `fallbackStem: true` verilirse çekimli kelimelerde kökün etimolojisine bakar.
- **`TDK.getProverbs(word)`**: Yalnızca aranan kelimenin geçtiği atasözü ve deyimleri dizi olarak getirir.
- **`TDK.isForeignWord(word)`**: Kelimenin yabancı kökenli olup olmadığını `boolean` olarak döner; kelime bulunamazsa `null` döner.
- **`TDK.groupByOrigin(words)`**: Bir kelime listesini etimolojik kökenlerine göre gruplar (bulunamayanlar `"Bilinmiyor"` altında toplanır).
- **`TDK.getSynonyms(word)`** / **`TDK.getAntonyms(word)`**: Kelimenin eş/zıt anlamlılarını döner (undocumented `gts-yeni` endpoint'i üzerinden; sonuç bulunamazsa `[]`).
- **`TDK.compareWords(a, b)`**: İki kelimeyi anlam sayısı, köken, hece bölünüşü, büyük ve küçük ünlü uyumu açısından yan yana karşılaştırır.
- **`TDK.analyzeText(text)`**: Bir metindeki (Türkçe bağlaçlar/edatlar hariç) her benzersiz kelimeyi tek tek arayıp ilk anlamını, kökenini ve varsa kökünü döner. Çekimli kelimeleri morfoloji motoruyla otomatik tespit edip kökleriyle (`isInflected: true, root: "..."`) birlikte analiz eder.

### 7. Yardımcı Metotlar
- **`TDK.getSuggestions(prefix)`**: TDK'nin ~81 bin kelimelik tam madde listesi üzerinden önek bazlı otomatik tamamlama önerileri döner (ilk çağrıda listeyi indirip önbelleğe alır, sonraki çağrılar anlıktır).
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

## Hata Yönetimi

Kütüphane, ayırt edilebilir hata sınıfları fırlatır (hepsi `Error`'dan türer):

- **`TDKValidationError`**: Boş kelime gibi geçersiz bir parametre verildiğinde.
- **`TDKNetworkError`**: Ağ isteği başarısız olduğunda, TDK sunucusu HTTP hata kodu döndüğünde veya cevap JSON olarak parse edilemediğinde (`status` ve `cause` alanlarını taşır).

```typescript
import { TDK, TDKValidationError, TDKNetworkError } from 'tdk-api';

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

## Lisans

Bu proje MIT Lisansı ile lisanslanmıştır. Kullanım hakları ve kısıtlamalar için kaynak kod içerisindeki lisans metnini inceleyebilirsiniz.
