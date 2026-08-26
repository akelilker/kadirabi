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

Build / artifact:

```text
npm run build
→ dist/
```

Workflow:

```text
.github/workflows/deploy-kadirabi.yml
```

### Trigger safety

- `push` to `main` → validation CI only (test / typecheck / build / verify:deploy)
- Production FTP upload → **manual** `workflow_dispatch` only
- First application push must not mutate production FTP

### FTP credentials

Required secrets:

- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`

Required secret **or** repository variable:

- `FTP_REMOTE_DIR` — FTP account root’una göre hedef klasör; **sonda `/` zorunlu**

Optional repository variables (Karmotors sibling defaults):

- `FTP_PROTOCOL` — default `ftps`
- `FTP_PORT` — default `21`
- `FTP_SECURITY` — default `loose`

`FTP_REMOTE_DIR` hard-coded değildir. Sunucu / FTP hesabı köküne göre ayarlanmalıdır.

Typical examples:

```text
public_html/kadirabi/
```

FTP root already `public_html`:

```text
kadirabi/
```

Dedicated FTP rooted directly at the app directory:

```text
./
```

Gerçek değer production öncesi cPanel/FTP account configuration ile doğrulanmalıdır. Boş `FTP_REMOTE_DIR` ile deploy fail-closed reddedilir (FTP root’a yazılmaz).

Upload yalnızca `./dist/` içeriğini `FTP_REMOTE_DIR` altına gönderir. `dangerous-clean-slate: false`. Domain root ve kardeş uygulamalar dokunulmaz.

Apache SPA fallback: `public/.htaccess` → build ile `dist/.htaccess` (`RewriteBase /kadirabi/`).

Credential değerleri bu dosyada yoktur.

## Notlar

- İstemci verisi IndexedDB’de tutulur (`kadirabi-taksit-alacak-v1`). Route/path değişince kaybolmaz.
- Canlı FTP/deploy bu depoda kullanıcı onayı olmadan çalıştırılmamalıdır.
