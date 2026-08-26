# Taksit & Alacak Hesaplayıcı

Taksitli satışlarda eksik / geç / düzensiz tahsilatın seçilen tarihteki ekonomik etkisini (açık ana para + para maliyeti) hesaplayan bağımsız web uygulaması.

## Geliştirme

```bash
npm ci
npm run dev
```

Dev sunucu Vite `base` nedeniyle `http://localhost:5173/kadirabi/` altında açılır.

```bash
npm test
npm run typecheck
npm run build
npm run preview
npm run verify:deploy
```

## Production Deployment

Production URL:

```text
https://karmotors.com.tr/kadirabi/
```

Vite base:

```text
/kadirabi/
```

Expected web directory:

```text
/home/karmotor/public_html/kadirabi
```

Build / artifact:

```text
npm run build
→ dist/
```

### Canonical architecture (otomatik)

```text
GitHub
  → push main
  → Validate (test / typecheck / build / verify)
  → FTP sync ./dist/ only
  → public_html/kadirabi/
```

### GitHub Actions (auto deploy)

Workflow:

```text
.github/workflows/deploy-kadirabi.yml
```

- `push` to `main` → validate + FTP deploy
- `workflow_dispatch` → aynı akış (manuel tetik)
- Upload kaynağı yalnızca `./dist/`
- `dangerous-clean-slate: false`

Gerekli Actions secrets / variables:

- `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
- `FTP_REMOTE_DIR` (sonda `/`; örn. `public_html/kadirabi/` veya `kadirabi/` veya dedicated hesap için `./`)

### cPanel Git (opsiyonel fallback)

Owner file:

```text
.cpanel.yml
```

Rutin deploy için gerekli değil. Node/npm olan sunucuda manuel Pull ile de yayınlanabilir; yalnızca `dist/` kopyalanır.

Apache SPA fallback artifact içinde gelir:

```text
public/.htaccess → dist/.htaccess (RewriteBase /kadirabi/)
```

Domain root `.htaccess` ve `public_html/` kardeş uygulamalar değiştirilmez.

Credential değerleri burada belgelenmez.

## Notlar

- İstemci verisi IndexedDB’de tutulur (`kadirabi-taksit-alacak-v1`). Route/path değişince kaybolmaz.
