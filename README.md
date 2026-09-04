# TDK API Node.js Wrapper

Bu proje, Türk Dil Kurumu (TDK) sözlük verilerine Node.js ortamından doğrudan, hızlı ve güvenilir bir şekilde erişim sağlamak amacıyla geliştirilmiş, TypeScript tabanlı resmî olmayan bir sarmalayıcı (wrapper) kütüphanedir. Herhangi bir dış bağımlılığa veya ikili (binary) dosyaya ihtiyaç duymadan HTTP üzerinden güncel verileri çeker.

## Kurulum

Projeyi Node.js projenize dahil etmek için aşağıdaki paket yöneticilerinden uygun olanı kullanabilirsiniz:

```bash
npm install tdk-api
```
veya global yükleyerek komut satırı aracını (CLI) kullanmak için:
```bash
npm install -g tdk-api
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
- **`TDK.checkSpelling(word)`**: Sıkça yapılan yanlışlar listesini ve TDK veritabanını kullanarak kelimenin doğru yazılıp yazılmadığını kontrol eder. Yanlışsa doğrusunu önerir.
- **`TDK.getCompoundWords(word)`**: Aranan kelime ile oluşturulmuş birleşik kelimeleri (Örn: dolma kalem) listeler.

### 3. Edebi ve Kültürel Analiz
- **`TDK.getExamples(word)`**: Ünlü yazarlardan edebi örnek cümleleri ve yazar isimlerini liste halinde döner.
- **`TDK.getOrigin(word)`**: Kelimenin hangi dilden geldiğini (etimolojik lisan kökenini) döner.
- **`TDK.getProverbs(word)`**: Yalnızca aranan kelimenin geçtiği atasözü ve deyimleri dizi olarak getirir.

### 4. Yardımcı Metotlar
- **`TDK.getSuggestions(prefix)`**: Kelimenin sadece ilk birkaç harfini girdiğinizde otomatik tamamlama önerilerini çeker.
- **`TDK.getAudioUrl(word)`**: Varsa TDK telaffuz ses dosyasının URL'sini oluşturur. `downloadAudio(word, destPath)` ile cihazınıza indirebilirsiniz.
- **`TDK.getDailyContent()`**: TDK anasayfasında yer alan "Günün Kelimesi, Atasözü ve Kuralı" içeriklerini çeker.

## Lisans

Bu proje MIT Lisansı ile lisanslanmıştır. Kullanım hakları ve kısıtlamalar için kaynak kod içerisindeki lisans metnini inceleyebilirsiniz.
