# 🌙 Luna Cafe Kids — Oyun Alanı Yönetim Sistemi

**Karaca Yazılım** tarafından geliştirilmiştir.

## Render'a Deploy Etme

### 1. GitHub'a Yükle
```bash
git init
git add .
git commit -m "Luna Cafe Kids ilk sürüm"
git remote add origin https://github.com/KULLANICI/lunacafe.git
git push -u origin main
```

### 2. Render.com'da Yeni Servis
1. [render.com](https://render.com) → **New** → **Web Service**
2. GitHub reponuzu bağlayın
3. Ayarlar:
   - **Name:** `lunacafe-kids`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. **Create Web Service** → Deploy tamamlanır

### Yerel Çalıştırma
```bash
npm install
npm start
# http://localhost:3000 adresini açın
```

## Özellikler
- ⏱ 30 dk (170₺) / 60 dk (250₺) geri sayım
- 🔔 Sesli uyarı ve Türkçe anons
- 🧾 Adisyon (oyun + ürünler)
- 💳 Nakit / Kredi Kartı ödeme
- 📊 Günlük rapor
- 💵 Kasa sayımı ve harcama takibi
- 📱 Mobil uyumlu
- 💾 Veriler tarayıcıda kalıcı (localStorage)
