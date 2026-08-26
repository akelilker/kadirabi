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

### Canonical architecture

```text
GitHub
  → push main
  → CI validation only (.github/workflows/deploy-kadirabi.yml)

cPanel Git Version Control
  → Update from Remote
  → Deploy HEAD Commit
  → .cpanel.yml
  → node/npm + npm ci/test/typecheck/build/verify
  → copy dist/ only
  → /home/karmotor/public_html/kadirabi
```

### GitHub Actions (CI only)

Workflow:

```text
.github/workflows/deploy-kadirabi.yml
```

- `push` to `main` → validation only (`npm ci`, test, typecheck, build, `verify:deploy`)
- `workflow_dispatch` → same validation only
- **No FTP upload**
- **No production mutation from GitHub Actions**

### cPanel Git deploy

Owner file:

```text
.cpanel.yml
```

Requirements:

- cPanel deploy shell must provide **Node.js** and **npm** (Vite build runs on the server during Deploy HEAD Commit)
- If `node`/`npm` is missing, deploy fails **before** touching `public_html/kadirabi`
- Only `dist/` contents are copied to the live folder
- Repository root / `src/` / `node_modules` are never published
- No `rm -rf` / destructive sync of the live tree on deploy

Apache SPA fallback ships in the artifact:

```text
public/.htaccess → dist/.htaccess (RewriteBase /kadirabi/)
```

Domain root `.htaccess` and sibling apps under `public_html/` are not modified.

Credential values are not documented here.

## Notlar

- İstemci verisi IndexedDB’de tutulur (`kadirabi-taksit-alacak-v1`). Route/path değişince kaybolmaz.
- Canlı cPanel Deploy yalnızca açık kullanıcı onayı ile çalıştırılmalıdır.
