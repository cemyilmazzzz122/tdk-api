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
tdk yazim herkes
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
tdk kubbealti merhaba
tdk nisanyan merhaba
tdk viki merhaba
```

Herhangi bir komuta `--json` bayrağı eklendiğinde çıktı, insan-okunur metin yerine tek satırlık JSON olarak basılır (script/otomasyon kullanımı için):

```bash
tdk ara kalem --json
# ["Yazma, çizme vb. işlerde kullanılan çeşitli biçimlerde araç", ...]
```

## Kullanım Başlangıcı

Modülü projenize dahil edip TDK sınıfını kullanarak tüm işlemleri başlatabilirsiniz. CommonJS ve ECMAScript Modules (ESM) yapıları tam olarak desteklenmektedir.

```typescript
import { TDK } from 'tdk-api';

// Performansı artırmak için bellek içi önbelleği (Memory Cache) aktif etme
TDK.enableCache(true);
```

## API Referansı ve Fonksiyonlar

Aşağıdaki metotlar `TDK` sınıfı üzerinden statik olarak erişilebilir durumdadır:

### 1. Temel Arama ve Anlamlar
- **`TDK.getWord(word)`**: Kelimenin TDK sözlüğündeki tüm yapısal özelliklerini tam veri seti (JSON) olarak getirir.
- **`TDK.getMeanings(word)`**: Sadece anlamları basit bir string dizisi olarak döner.
- **`TDK.getWordsBatch(wordsArray)`**: Birden fazla kelimeyi aynı anda aramak için kullanılır (sunucuyu yormamak adına yerleşik gecikme içerir).

### 2. Dilbilgisi ve Gramer Özellikleri
- **`TDK.syllabicate(word)`**: Kelimeyi Türkçe heceleme kurallarına göre doğru hecelerine ayırır (Örn: `['mu', 'vaf', 'fa', 'ki', 'yet']`). API isteği atmaz, çok hızlıdır.
- **`TDK.checkVowelHarmony(word)`**: Kelimenin büyük ünlü uyumuna uyup uymadığını (boolean) kontrol eder.
- **`TDK.getPartOfSpeech(word)`**: Kelimenin sözcük türünü (isim, sıfat, zarf vb.) döndürür.
- **`TDK.checkSpelling(word)`**: Kelimenin doğru yazılıp yazılmadığını kontrol eder. Önce TDK'nin "sık yapılan yanlışlar" listesinde tam eşleşme arar; bulamazsa TDK'nin ~81 bin kelimelik tam madde listesi üzerinde Damerau-Levenshtein edit-distance ile en yakın kelimeyi önerir (bitişik harf yer değiştirmelerini de tek düzeltme sayar; örn. `herkez` → `herkes`, `mektub` → `mektup`, `yanlız` → `yalnız`). Kelime sıklığı verisi olmadığı için nadiren aynı mesafedeki iki aday arasında beklenenden farklı biri seçilebilir.
- **`TDK.getCompoundWords(word)`**: Aranan kelime ile oluşturulmuş birleşik kelimeleri (Örn: dolma kalem) listeler.

### 3. Edebi ve Kültürel Analiz
- **`TDK.getExamples(word)`**: Ünlü yazarlardan edebi örnek cümleleri ve yazar isimlerini liste halinde döner.
- **`TDK.getOrigin(word)`**: Kelimenin hangi dilden geldiğini (etimolojik lisan kökenini) döner; kelime hiç bulunamazsa `null` döner, bulunup köken kaydı yoksa `"Türkçe"` döner.
- **`TDK.getProverbs(word)`**: Yalnızca aranan kelimenin geçtiği atasözü ve deyimleri dizi olarak getirir.
- **`TDK.isForeignWord(word)`**: Kelimenin yabancı kökenli olup olmadığını `boolean` olarak döner; kelime bulunamazsa `null` döner.
- **`TDK.groupByOrigin(words)`**: Bir kelime listesini etimolojik kökenlerine göre gruplar (bulunamayanlar `"Bilinmiyor"` altında toplanır).
- **`TDK.getSynonyms(word)`** / **`TDK.getAntonyms(word)`**: Kelimenin eş/zıt anlamlılarını döner (undocumented `gts-yeni` endpoint'i üzerinden; sonuç bulunamazsa `[]`).
- **`TDK.compareWords(a, b)`**: İki kelimeyi anlam sayısı, köken, hece bölünüşü ve büyük ünlü uyumu açısından yan yana karşılaştırır.
- **`TDK.analyzeText(text)`**: Bir metindeki (Türkçe bağlaçlar/edatlar hariç) her benzersiz kelimeyi tek tek arayıp ilk anlamını ve kökenini döner. Not: TDK yalnızca yalın (sözlük) biçimleri indeksliyor, morfolojik analiz yapmıyor — bu yüzden "evde", "dildir" gibi ek almış kelimeler kökleri (`ev`, `dil`) sözlükte olsa bile `found: false` döner; bu veri kaynağının doğal bir sınırlılığıdır.

### 4. Yardımcı Metotlar
- **`TDK.getSuggestions(prefix)`**: TDK'nin ~81 bin kelimelik tam madde listesi üzerinden önek bazlı otomatik tamamlama önerileri döner (ilk çağrıda listeyi indirip önbelleğe alır, sonraki çağrılar anlıktır).
- **`TDK.getAudioUrl(word)`**: TDK'nin bu kelime için gerçekten bir ses kaydı varsa doğrudan indirme URL'sini döner, yoksa `null`. `downloadAudio(word, destPath)` ile cihazınıza indirebilirsiniz.
- **`TDK.getDailyContent()`**: TDK anasayfasında yer alan "Günün Kelimesi, Atasözü ve Kuralı" içeriklerini çeker.
- **`TDK.getWordOfTheDay()`**: `getDailyContent()`'in üzerine ince bir katman; günün kelimesini ve tüm anlamlarını `{ word, meanings }` şeklinde döner.
- **`TDK.getRandomWord()`**: Günün içeriğindeki kelime ve atasözü havuzundan rastgele bir tanesini `{ type: "kelime" | "atasoz", madde, anlam }` şeklinde seçer (not: tüm sözlük değil, sadece o günkü içerik havuzundan seçim yapar).
- **`TDK.getKurallar()`**: TDK'nin `/icerik` akışının o an döndürdüğü yazım kuralı sayfa(lar)ını `{ adi, url }` şeklinde listeler. Not: bu sabit bir katalog değildir — `/icerik` her istekte, yaklaşık yirmi kurallık bir havuzdan rastgele tek bir kural döndürür.
- **`TDK.getRule(name)`**: Adı verilen (küçük/büyük harf duyarsız, alt dize eşleşmesi) yazım kuralının tam metnini `tdk.gov.tr`'den çekip düz metne çevirir. `getKurallar()`'ın rastgeleliği yüzünden istenen kuralı bulana kadar eşzamanlı gruplar hâlinde (toplam en fazla 25 deneme, ~5 round-trip'e sığdırılmış) yeniden dener; bulamazsa veya sayfa ayrıştırılamazsa `null` döner.

### 5. Diğer Sözlük Kaynakları

TDK dışındaki bu üç kaynak da her zaman kullanılabilir/dokümante edilmiş resmî API'ler değildir; her biri **fragile scraping** (kırılgan, dokümante edilmemiş entegrasyon) — kaynak taraflarında bir değişiklik olursa `null`/`[]` dönerler, hataya düşmezler. Verinin telif/kullanım koşulları kaynağa göre farklıdır: Wiktionary içeriği CC BY-SA lisanslıdır (açık); Nişanyan Sözlük ücretsiz, açık bir kişisel/akademik kaynaktır; **Kubbealtı Lugatı ise ticari bir sözlük ürünüdür** — bu kütüphane onu da dokümante edilmemiş bir uç noktadan çekebiliyor olsa da, kullanımınızı Kubbealtı'nın kendi kullanım şartlarına göre değerlendirmeniz önerilir.

- **`TDK.getKubbealti(word)`**: Kubbealtı Lugatı'nın ("Misalli Büyük Türkçe Sözlük") verilerini `{ kelime, anlam }` dizisi olarak döner (`anlam` zengin tipografi içeren ham HTML'dir). `getKubbealtiMeanings(word)` aynı veriyi düz metne çevirir. `getKubbealtiSuggestions(prefix)` Kubbealtı'nın kendi otomatik tamamlama uç noktasını kullanır (TDK'nin `getSuggestions()`'ından bağımsız, ayrı bir veri kaynağı). Kubbealtı başlıkları klasik Türkçe imlayla (ü/ö/ç/ğ/ş, düzeltme işareti) indekslidir; düz ASCII'ye yakın bir sorgu (örn. `ruzgar`) boş dönerse, kütüphane tek harflik Türkçeleştirme varyasyonlarını (`rüzgâr`, `rûzgar` vb.) otomatik dener. Not: Kubbealtı'nın veri sunucusu (`eski.lugatim.com`) sertifika zincirini eksik gönderiyor; bu kütüphane eksik ara sertifikaları ekleyerek zinciri düzgün doğruluyor (doğrulamayı kapatmıyor) — Let's Encrypt bu ara sertifikayı döndürürse bu entegrasyon `null` dönmeye başlar.
- **`TDK.getNisanyan(word)`**: Nişanyan Sözlük'ten kelimenin etimoloji paragrafını düz metin olarak döner; kelime bulunamazsa `null`.
- **`TDK.getWiktionary(word)`**: Türkçe Vikisözlük'ten (`tr.wiktionary.org`) resmî MediaWiki API'si (`action=query&prop=extracts`) üzerinden veri çeker — bu üçü arasında scraping olmayan, resmî ve en kararlı olanı. `{ raw, sections }` döner; `sections` metni `== Köken ==`, `=== Söyleniş ===` gibi başlıklara göre bir sözlüğe ayırır. `getWiktionarySection(word, sectionName)` tek bir bölümü (örn. `"Köken"`) büyük/küçük harf duyarsız süzer.

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
