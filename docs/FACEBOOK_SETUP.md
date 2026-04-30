# Vertmonhub-д хэрэгтэй Facebook App API авах дэлгэрэнгүй заавар

> **Зорилго:** Vertmonhub-ыг шинэ environment-д (local dev эсвэл staging) ажиллуулахын тулд Facebook App-ыг шинээр үүсгэж, Messenger DM webhook болон OAuth-ыг тохируулах step-by-step заавар.
>
> **Цар хүрээ:** Development / Test mode (App Review-гүй, App Roles → Tester хүмүүстэй ажиллана). Зөвхөн Facebook Messenger + Page comments. Instagram алхмууд хасагдсан.
>
> **Production-ы тохиргоо:** Одоо ажиллаж байгаа production App-ыг өөрчлөх бол `docs/FACEBOOK_OAUTH_SETUP.md`-ийг үз.

---

## Юу авах вэ?

Facebook App-аас авч `.env.local` дотор бөглөх 5 credentials:

| ENV variable | Хаанаас авах | Жишээ утга |
|--------------|--------------|------------|
| `FACEBOOK_APP_ID` | App → Settings → Basic | `1234567890123456` |
| `FACEBOOK_APP_SECRET` | App → Settings → Basic → **Show** | `abc123def456...` |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Messenger → API Settings → **Generate Token** | `EAAB...` |
| `FACEBOOK_VERIFY_TOKEN` | Өөрөө сонгоно (default `vertmonhub_verify_2026`) | `vertmonhub_verify_2026` |
| `FACEBOOK_PAGE_ID` | Facebook Page → About → Page ID | `987654321...` |
| `FACEBOOK_LOGIN_CONFIG_ID` | Facebook Login for Business → Configurations → Configuration ID (заавал биш) | `946025855026007` |

Энэ заавар таныг эдгээрийг авах процессоор алхам алхмаар явуулна.

---

## Урьдчилсан бэлтгэл

Эхлэхээсээ өмнө дараах зүйлс бэлэн байх ёстой:

1. **Facebook эзэн account** — өөрийн нэрээр developers.facebook.com-д хандах эрхтэй.
2. **Facebook Page** — Vertmonhub-той холбогдох бизнесийн page (тестийн зорилгоор шинэ Page үүсгэж болно).
3. **Vertmonhub deploy эсвэл local dev** — `npm run dev` асаасан эсвэл Vercel Preview deploy.
4. **Public HTTPS URL** — Facebook webhook нь HTTP-г хүлээж авдаггүй учраас:
   - Local dev: [ngrok](https://ngrok.com/) (`ngrok http 3001`)
   - Staging: Vercel Preview URL (`*.vercel.app`)

---

## Алхам 1: Meta Developer Console-д App үүсгэх

1. https://developers.facebook.com/apps руу нэвтрэн ороход дараах товч гарна:
   - **Create App** дар.
2. Use case: **Other** → **Next**.
3. App type: **Business** → **Next**.
4. Доорх талбаруудыг бөгл:
   - **App name:** `Vertmon Hub Dev` (development environment гэдгийг тусга)
   - **App contact email:** өөрийн имэйл
   - **Business Account:** өөрийн Business Manager-ыг сонго (хэрэв байхгүй бол үүсгэх pop-up автоматаар нээгдэнэ)
5. **Create App** товчийг дар. Facebook нууц үгээ оруулна.
6. App-ыг үүсгэсний дараа таныг **App Dashboard**-руу буцаана. Зүүн талын меню дээр **Settings → Basic** руу ор.

> 💡 **App ID:** Settings → Basic дээр **App ID** дугаар гарна. Үүнийг хуулж `FACEBOOK_APP_ID`-д хадгалж бай.

---

## Алхам 2: Privacy / Terms / Data Deletion URL тохируулах

App → **Settings → Basic** дээр доорх талбаруудыг бөгл:

| Талбар | Утга |
|--------|------|
| **Privacy Policy URL** | `https://YOUR_PUBLIC_URL/privacy` |
| **Terms of Service URL** | `https://YOUR_PUBLIC_URL/terms` |
| **User data deletion** → **Data Deletion Callback URL** | `https://YOUR_PUBLIC_URL/api/meta/data-deletion` |
| **App Domains** | `localhost` (dev), `*.ngrok-free.app`, `*.vercel.app` (туслах) |
| **Category** | **Business and Pages** |

> ✅ **Зөвлөмж:** Vertmonhub repo-д эдгээр route бүгд бэлэн байгаа:
> - `src/app/privacy/page.tsx`
> - `src/app/terms/page.tsx`
> - `src/app/api/meta/data-deletion/route.ts`
> - `src/app/deletion-status/page.tsx`

**Save Changes** товчийг дар.

---

## Алхам 3: App Secret хадгалах

1. App → Settings → Basic дээр **App Secret** хэсгээс **Show** товчийг дар.
2. Facebook нууц үгээ оруулсны дараа гарсан утгыг хуул.
3. `.env.local` дотор `FACEBOOK_APP_SECRET=...` гэж хадгал.

App Secret хаана хэрэглэгдэх вэ?
- **Webhook signature verify** (`X-Hub-Signature-256`) — `src/lib/utils/verify-webhook-signature.ts`
- **OAuth token exchange** — `src/app/api/auth/facebook/callback/route.ts:33`
- **GDPR data deletion signed request HMAC verify** — `src/app/api/meta/data-deletion/route.ts`

> ⚠️ **Анхаар:** App Secret-ыг хэзээ ч клиент сайд код, public repo дээр хадгалж болохгүй. Зөвхөн server side ENV-д бай.

---

## Алхам 4: Facebook Login for Business product нэмэх

App Dashboard → **+ Add Product** товч → **Facebook Login for Business** хэсгийн **Set Up** товч.

### a) OAuth Settings

Facebook Login for Business → **Settings** → **OAuth Settings** дээр:

- **Valid OAuth Redirect URIs**:
  ```
  http://localhost:3001/api/auth/facebook/callback
  https://YOUR_PUBLIC_URL/api/auth/facebook/callback
  ```

- **Login with the JavaScript SDK:** хэрэгтэй биш (Vertmonhub нь server-side OAuth ашигладаг).

**Save Changes** дар.

### b) Configuration үүсгэх

Facebook Login for Business → **Configurations** → **Create Configuration**:

- **Configuration name:** `Vertmonhub Dev Login`
- **Login type:** **Business login for users**
- **Permissions** (зөвшөөрөл):
  - ✅ `pages_show_list`
  - ✅ `pages_messaging`
  - ✅ `pages_manage_metadata`
  - ✅ `email`
  - ✅ `public_profile`

**Create** товчийг дар. Үүний дараа гарах **Configuration ID** утгыг хуулж авна.

### c) Configuration ID-г ENV-д бөглөх

Vertmonhub нь Facebook Login `config_id`-ийг `FACEBOOK_LOGIN_CONFIG_ID` ENV-аас уншдаг. Шинэ Configuration үүсгэсэн бол:

```bash
# .env.local
FACEBOOK_LOGIN_CONFIG_ID=<ШИНЭ_CONFIG_ID>
```

> 💡 **Default:** ENV хоосон үед код нь `946025855026007` (legacy production config) руу буцдаг. Шинэ App-д заавал ENV-ыг бөглөнө.

---

## Алхам 5: Messenger Platform product нэмэх

App Dashboard → **+ Add Product** → **Messenger** → **Set Up**.

### a) Long-lived Page Access Token үүсгэх

1. Messenger → **API Settings** руу ор.
2. **Generate Tokens** хэсэгт өөрийн Facebook Page-ээ сонго.
3. Гарах permissions popup-аас зөвшөөрөл өг.
4. Үүссэн token-ыг хуул (нэг л удаа харагдана!).
5. `.env.local` дотор `FACEBOOK_PAGE_ACCESS_TOKEN=EAAB...` гэж хадгал.

> ⚠️ **Token-ы хугацаа:** Development mode-д long-lived token нь 60 хоног үргэлжилнэ. App Review дараа auto-refresh идэвхждэг.

### b) Webhook callback тохируулах

Messenger → **API Settings** → **Webhooks** хэсэг:

- **Add Callback URL** товчийг дар.
- **Callback URL:** `https://YOUR_PUBLIC_URL/api/webhook`
- **Verify Token:** `vertmonhub_verify_2026` (эсвэл өөрийн санасан string)
- **Verify and Save** дар.

> 🔐 **Verify token нь нууц утга биш.** Зөвхөн анхны handshake-д ашиглагддаг. Гэхдээ ENV-д бөглөсөн утгатайгаа таарч байх ёстой.

### c) Subscription fields сонгох

Webhook үүсгэсний дараа доорх field-уудыг сонго:

- ✅ `messages` — Messenger DM (text + attachments)
- ✅ `messaging_postbacks` — Button click postbacks
- ✅ `feed` — Page comments дээр AI хариу үлдээх
- ☐ `messaging_optins`, `message_deliveries` — хэрэггүй

### d) Page Subscriptions

Messenger → API Settings → **Webhooks** → **Page Subscriptions** хэсэгт:

1. **Add Subscriptions** дар → Facebook Page-ээ сонго.
2. **Subscribe to Webhooks** товчийг дар.
3. Дараах field-ууд subscribe хийгдсэн эсэхийг хяна: `messages`, `messaging_postbacks`, `feed`.

---

## Алхам 6: Page ID олох

1. Facebook Page-ээ нээ.
2. Зүүн талын меню дээр **About** → доош гүйлгээд **Page ID** утгыг ол.
   - Шинэ Page UI-д: **Settings → Page Info → Page ID**.
3. Хуулж аваад `.env.local` дотор `FACEBOOK_PAGE_ID=...` гэж хадгал.

> 💡 **Хаана хэрэглэгддэг вэ?** `src/lib/webhook/WebhookService.ts:getShopByPageId` — webhook-аас ирэх Page ID-аар Vertmonhub-ийн `shops` table-аас зохих shop-ыг олдог.

---

## Алхам 7: App Roles → Testers нэмэх

Development mode-д Facebook нь зөвхөн App Roles-д бүртгэгдсэн хүмүүсийн DM-ийг forward хийнэ. Бусад хэрэглэгчид хариу аваагүй ч мессеж нь webhook-руу ирэхгүй.

1. App Dashboard → **App Roles** → **Roles** хуудсанд ор.
2. **Add People** → **Tester** сонгоод тестер хүний Facebook account-ыг нэмнэ.
3. Тестер хүн өөрийн Facebook notification дотор урилгыг хүлээж зөвшөөрөх ёстой (Facebook → Settings → Apps and Websites → Tests → Accept).
4. Үндсэн Admin (App-ыг үүсгэсэн хүн) автоматаар тест хийх боломжтой — нэмэлт нэмэх шаардлагагүй.

---

## Алхам 8: Environment variables бөглөх

`.env.local` файлд:

```bash
# Facebook App (Алхам 1, 3-д авсан)
FACEBOOK_APP_ID=<App ID>
FACEBOOK_APP_SECRET=<App Secret>

# Page (Алхам 5a, 6-д авсан)
FACEBOOK_PAGE_ACCESS_TOKEN=<Long-lived Page Token>
FACEBOOK_PAGE_ID=<Page ID>

# Webhook (Алхам 5b-тэй адил утга)
FACEBOOK_VERIFY_TOKEN=vertmonhub_verify_2026

# Facebook Login config (Алхам 4c-д үүсгэсэн Configuration ID — заавал биш)
FACEBOOK_LOGIN_CONFIG_ID=

# App URL (callback зориулалттай)
NEXT_PUBLIC_APP_URL=https://YOUR_PUBLIC_URL
```

Production-д Vercel ашиглаж бол:
- Vercel project → **Settings → Environment Variables** дээр дээрх 6 утгыг бүгдийг нь нэм.
- Тус бүрд **Production**, **Preview**, **Development** environments-ыг сонго.
- Дараа нь **Redeploy** хийж шинэ ENV-ыг ачаалах.

---

## Алхам 9: Local development-д ngrok ашиглах

Facebook webhook нь HTTPS public URL шаарддаг. Local dev үед:

```bash
# Terminal 1
npm run dev          # localhost:3001 дээр Next.js асна

# Terminal 2
ngrok http 3001      # https://abc123.ngrok-free.app шиг public URL гарна
```

ngrok-ийн URL-ыг ашиглан Facebook App дотор:
- Webhook callback URL: `https://abc123.ngrok-free.app/api/webhook`
- OAuth redirect URI: `https://abc123.ngrok-free.app/api/auth/facebook/callback`
- App Domains: `*.ngrok-free.app`

> ⚠️ **Анхаар:** ngrok дахин эхлэхэд URL шинэчлэгдэх (хэрэв paid account биш бол). Шинэ URL-ыг Facebook UI дээр дахин бөгл.
>
> 💡 **Илүү хялбар:** ngrok account → reserved subdomain аваад тогтмол URL ашигла.

---

## Алхам 10: Тестлэх (Verification)

### a) Webhook verify GET

Public URL-д GET request илгээж handshake-ыг тестлэ:

```bash
curl "https://YOUR_PUBLIC_URL/api/webhook?hub.mode=subscribe&hub.verify_token=vertmonhub_verify_2026&hub.challenge=test123"
```

Хариу нь яг `test123` гэсэн string байх ёстой. Хэрэв `Forbidden` эсвэл `Webhook not configured` гарвал:
- ENV `FACEBOOK_VERIFY_TOKEN`-той Facebook UI дотор оруулсан Verify Token таарч байгаа эсэхийг шалга.

### b) Webhook signature тестлэх

Facebook App Dashboard → Messenger → **API Settings → Webhooks → Test** товчийг дар.

- Нэг Test event илгээ.
- Vertmonhub-ийн `npm run dev` log-д:
  ```
  [info] Webhook received for platform: messenger
  ```
- Хэрэв `Webhook signature verification failed` гарвал — `FACEBOOK_APP_SECRET` буруу.

### c) Бодит DM илгээх

1. Тестер account-аас Facebook Page-руу DM илгээ.
2. Server log-д дараах гарах ёстой:
   ```
   [info] Webhook received for platform: messenger
   [info] AI router invoked
   [info] Sent text message
   ```
3. Тестер account-руу AI хариу DM ирэх ёстой.

### d) OAuth flow тест

1. Browser-аар `http://localhost:3001/api/auth/facebook` руу ор.
2. Facebook login dialog → Page сонгох → callback success.
3. URL `/dashboard?fb_success=true&page_count=N` руу redirect болж dashboard нээгдэнэ.
4. DevTools → Application → Cookies дотор `fb_pages` cookie set хийгдсэн эсэхийг шалга.

---

## Тулгарч болох асуудлууд (Troubleshooting)

| Алдаа | Шалтгаан | Шийдэл |
|-------|----------|--------|
| `Webhook signature verification failed` | App Secret буруу эсвэл webhook body modify хийгдсэн | App Secret-ыг дахин copy хийж шалга |
| `Webhook verify failed: Forbidden` | `FACEBOOK_VERIFY_TOKEN` ENV утга Facebook UI-тай таарахгүй | Хоёуланг нэг утгад тохируул |
| `Invalid OAuth redirect URI` | Redirect URI Facebook App-д бүртгэгдээгүй | Facebook Login → Settings → Valid OAuth Redirect URIs дотор нэмж Save Changes |
| `pages_messaging permission denied` | App Review-гүй, Tester биш account ашиглаж байна | App Roles → Testers-руу хэрэглэгчийг нэм |
| Webhook event ирэхгүй | Page Subscription идэвхгүй эсвэл ngrok URL хуучирсан | Webhooks → Page Subscriptions-руу очиж дахин Subscribe хий |
| `config_id is invalid` | `FACEBOOK_LOGIN_CONFIG_ID` ENV-д буруу утга эсвэл өмнөх production config-ийг ашиглаж байна | `.env.local`-д шинэ Configuration ID-г бөгл |
| `App secret missing` | `.env.local`-д бөглөөгүй эсвэл server restart хийгээгүй | `.env.local`-ыг шалгаад `npm run dev`-ыг restart |

---

## Production-руу шилжих үед (Future)

Энэ заавар нь Development mode-д хязгаарлагдана. Public хэрэглэгчдэд гаргахын тулд нэмэлт алхмууд:

- **App Review** шаардлагатай permissions:
  - `pages_messaging` — DM хариу илгээх
  - `pages_manage_metadata` — Webhook subscribe
  - `pages_show_list` — Page list харах
- **Business Verification** — Business Manager дээр компанийн нотолгоо (улсын бүртгэл, нэхэмжлэх г.м.).
- **Production webhook URL** — `*.vercel.app` эсвэл custom домэйн.
- **App Mode → Live** товчийг дар.
- App Review нь 1–3 долоо хоног үргэлжилнэ. Permission бүрд:
  - Use case description
  - Step-by-step screencast
  - Test user credentials
- илүү дэлгэрэнгүй: `docs/FACEBOOK_OAUTH_SETUP.md` нь production-д өмнө деплой хийсэн App-ы конфигийг харуулна.

---

## Холбогдох файлууд

| Файл | Юу хийдэг |
|------|-----------|
| `.env.local.example` | ENV шаблон (Facebook section: lines 8-13) |
| `src/app/api/webhook/route.ts` | Webhook GET (verify) + POST (signature + entry routing) |
| `src/app/api/auth/facebook/route.ts` | OAuth start (config_id энд hardcoded) |
| `src/app/api/auth/facebook/callback/route.ts` | OAuth callback (token exchange + page list) |
| `src/app/api/meta/data-deletion/route.ts` | GDPR data deletion handler |
| `src/lib/facebook/messenger.ts` | Graph API send helpers |
| `src/lib/utils/verify-webhook-signature.ts` | HMAC-SHA256 signature verify |
| `src/lib/webhook/WebhookService.ts` | `getShopByPageId`, AI features lookup |

---

## Холбоо барих

Асуудал гарвал: aagii9912@gmail.com
