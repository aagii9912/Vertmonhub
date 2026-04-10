# 📋 Syncly — Business Info шинэчлэх & App Review 100% Амжилтын Төлөвлөгөө

## Хэсэг 1: Facebook Business Info шинэчлэх (Step by Step)

### 🔗 Нэвтрэх линк
> https://business.facebook.com/latest/settings/business_info?business_id=241132693220464

---

### Алхам 1: Business Settings нэвтрэх
1. [business.facebook.com](https://business.facebook.com) дээр **Admin** эрхтэй бүртгэлээр нэвтрэх
2. Зүүн талын цэснээс **⚙️ Settings** → **Business Info** дээр дарах

### Алхам 2: Legal Business Name (Хуулийн нэр)
1. **"Legal business name"** талбарт бизнесийнхээ **албан ёсны бүртгэлийн нэр**ийг бичнэ
2. Энэ нэр нь таны **УБЕГ-ийн гэрчилгээ** эсвэл **ТАГ** дахь нэртэй **яг адилхан** байх ёстой
3. Таны хувьд: `"MM Line Tracking LLC"` (Syncly бол бүтээгдэхүүний нэр, компанийн нэр биш)

> [!CAUTION]
> Нэр таарахгүй бол Business Verification **REJECT** болно!

### Алхам 3: Business Address (Хаяг)
1. **Street address** — Бизнесийн хаяг (utility bill эсвэл бүртгэлтэй таарсан)  
2. **City** — Хот (жишээ: `Ulaanbaatar`)
3. **State/Province** — Аймаг/Дүүрэг
4. **Zip/Postal code** — Шуудангийн код
5. **Country** — `Mongolia`

### Алхам 4: Phone Number (Утасны дугаар)
1. Бизнесийн утасны дугаар оруулна (+976-XXXX-XXXX)
2. Энэ дугаар руу Meta **OTP код** илгээж баталгаажуулж болно
3. **Бодит, залгаж болдог** дугаар оруулах шаардлагатай

### Алхам 5: Website (Вэбсайт)
1. `https://syncly.mn` оруулна
2. Вэбсайт дээр бизнесийн нэр, холбоо барих мэдээлэл **тодорхой** харагдах ёстой
3. HTTPS шифрлэлттэй байх шаардлагатай ✅

### Алхам 6: Business Email (И-мэйл)
1. `info@syncly.mn` эсвэл `support@syncly.mn` гэх мэт **домэйнтэй таарсан** и-мэйл
2. Gmail/Yahoo и-мэйл **ашиглахгүй** — reject болох шалтгаан нь энэ!

> [!IMPORTANT]
> И-мэйлийн домэйн = Вэбсайтын домэйн байх ёстой → `@syncly.mn`

### Алхам 7: Business Category
1. `Technology/Software` эсвэл `Internet Company` гэж сонгох

### Алхам 8: Save & Verify
1. Бүх мэдээллээ шалгаад **Save** дарах
2. Security Center → **Start Verification** дарах (идэвхтэй бол)

---

## Хэсэг 2: Business Verification бичиг баримт

### Шаардлагатай бичиг баримтууд:

| # | Бичиг баримт | Тайлбар |
|---|---|---|
| 1 | **Бизнесийн гэрчилгээ** | УБЕГ-ээс авсан компанийн бүртгэлийн гэрчилгээ |
| 2 | **ТАГ-ийн гэрчилгээ** | Татварын албаны гэрчилгээ (НДМ дугаар) |
| 3 | **Хаягийн баталгаа** | Utility bill (цахилгааны төлбөр), банкны хуулга, эсвэл бизнесийн гэрчилгээ |

> [!TIP]
> Бүх бичиг баримтыг **тод, бүрэн хуудас** харагдахаар скан хийх. Тайрсан зураг REJECT болно!

---

## Хэсэг 3: App Review 100% Амжилтын Төлөвлөгөө

### 📱 Syncly-д шаардлагатай Permissions (6 ширхэг)

| # | Permission | Хэрэглээ | Хаана ашиглагдаж байгаа |
|---|---|---|---|
| 1 | `public_profile` | Хэрэглэгчийн үндсэн мэдээлэл | OAuth Login |
| 2 | `pages_show_list` | Page-үүдийн жагсаалт | Onboarding — Page сонголт |
| 3 | `pages_messaging` | Messenger зурвас унших/илгээх | Inbox + AI Auto-Reply |
| 4 | `pages_manage_metadata` | Webhook бүртгэл | Real-time мессеж хүлээн авах |
| 5 | `instagram_basic` | IG бизнес аккаунт мэдээлэл | IG холболт |
| 6 | `instagram_manage_messages` | IG DM унших/илгээх | IG Inbox + AI Auto-Reply |

---

### 🎬 App Review Бэлдэх Checklist

#### ✅ Phase 1: Урьдчилсан бэлтгэл (1-2 өдөр)

- [ ] **1. Privacy Policy хуудас бэлдэх**
  - `https://syncly.mn/privacy` хуудас үүсгэх
  - Ямар data цуглуулдаг, хэрхэн ашигладгийг тайлбарлах
  - Meta-ийн crawler-т нэвтрэх боломжтой байлгах (geo-block хийхгүй)

- [ ] **2. Terms of Service хуудас бэлдэх**
  - `https://syncly.mn/terms` хуудас үүсгэх

- [ ] **3. App Settings шалгах (Meta for Developers)**
  - [developers.facebook.com](https://developers.facebook.com) → App Dashboard
  - App Icon (1024x1024 PNG) оруулсан эсэх
  - App Domain: `syncly.mn` оруулсан эсэх
  - Privacy Policy URL: `https://syncly.mn/privacy`
  - Terms of Service URL: `https://syncly.mn/terms`
  - App Category: `Business` гэж сонгосон эсэх

- [ ] **4. Test User тохируулах**
  - App Dashboard → Roles → Add **Test User**
  - Test user-ийн нэвтрэх мэдээлэл (email/password) бэлдэх
  - Test user дээр Facebook Page холбосон байлгах
  - Test user дээр Instagram Business Account холбосон байлгах (Pro plan demo-д)

- [ ] **5. API Calls хийх**
  - Permission бүрийг дор хаяж **1 удаа амжилттай** ашигласан байх
  - Сүүлийн 30 хоногт хийсэн байх шаардлагатай

---

#### ✅ Phase 2: Screencast бичлэг хийх (1 өдөр)

> [!IMPORTANT]
> Screencast бол **хамгийн чухал** хэсэг. 90% reject-ийн шалтгаан нь муу screencast!

##### Бичлэгийн шаардлага:
- **1080p** эсвэл түүнээс дээш чанар
- **Англи хэл** дээр бүх UI
- Хөтөч дээр бичих (OBS Studio ашиглах)
- **2-5 минут** урттай
- Text caption/narration оруулах

##### Screencast-ийн агуулга (permission бүрээр):

```
🎬 БИЧЛЭГ 1: pages_show_list + pages_messaging + pages_manage_metadata
═══════════════════════════════════════════════════════════════════════

00:00 — Syncly landing page (syncly.mn) харуулах
00:15 — Login with Clerk → Dashboard
00:30 — Settings → "Connect Facebook" дарах
00:45 — Facebook OAuth popup → Permission-ууд зөвшөөрөх
01:00 — Page-ийн жагсаалт → Нэгийг сонгох (pages_show_list)
01:15 — "Connected" status харуулах
01:30 — Inbox руу шилжих
01:45 — Өөр browser-ээс test message илгээх
02:00 — Dashboard дээр message ирсэнг харуулах (pages_messaging READ)
02:15 — Reply бичих → Send → Messenger дээр харагдах (pages_messaging WRITE)
02:30 — AI Auto-Reply идэвхжүүлэх → Автомат хариулт демо
02:45 — Webhook subscription ажиллаж буйг харуулах (pages_manage_metadata)

🎬 БИЧЛЭГ 2: instagram_basic + instagram_manage_messages
═══════════════════════════════════════════════════════════

00:00 — Settings → "Connect Instagram" дарах
00:15 — OAuth popup → Instagram permissions зөвшөөрөх
00:30 — Instagram Business Account сонгох (instagram_basic)
00:45 — "Connected" status
01:00 — Instagram DM test message илгээх
01:15 — Dashboard дээр DM ирсэнг харуулах (instagram_manage_messages READ)
01:30 — Reply → Instagram дээр хариулт очсонг харуулах (WRITE)
01:45 — AI Auto-Reply демо Instagram дээр
```

---

#### ✅ Phase 3: Submission form бөглөх (1 өдөр)

Permission бүрт бичих тайлбар:

##### `pages_messaging` — тайлбарын загвар:
```
Syncly is an AI-powered customer service platform. We use pages_messaging 
to read incoming messages from the connected Facebook Page's Messenger 
and display them in our unified inbox dashboard. Business owners can then 
reply manually or enable AI-powered auto-replies that are context-aware 
(using the business's product catalog and FAQs to generate helpful responses).

User Flow:
1. Business owner connects their Facebook Page via OAuth
2. Customer sends a message to the Page on Messenger
3. Message is received via Webhook and displayed in Syncly's Inbox
4. Business owner replies manually OR AI agent auto-replies
5. Reply is sent back to the customer via Messenger API
```

##### `instagram_manage_messages` — тайлбарын загвар:
```
Syncly uses instagram_manage_messages to provide the same AI-powered 
customer service automation for Instagram Direct Messages. When a customer 
sends a DM to the connected Instagram Business Account, Syncly reads the 
message, analyzes customer intent using AI (e.g., product inquiry, order 
status), and either displays it for manual reply or sends an automated 
response.

User Flow:
1. Business owner connects Instagram Business Account via OAuth
2. Customer sends a DM on Instagram
3. DM is received and displayed in Syncly's unified inbox
4. AI analyzes intent and suggests/sends appropriate response
5. Response is delivered back to the customer via Instagram API
```

##### `pages_manage_metadata` — тайлбарын загвар:
```
Syncly uses pages_manage_metadata to subscribe to Webhook events 
(specifically the 'messages' field) for connected Facebook Pages. This 
enables real-time message delivery to our platform, providing a live-chat 
experience for business owners managing their customer conversations.

Without this permission, we would need to poll for new messages, resulting 
in delayed responses and poor user experience.
```

##### `pages_show_list` — тайлбарын загвар:
```
Syncly uses pages_show_list to display a list of Facebook Pages managed 
by the authenticated user during the onboarding process. The business 
owner selects which specific Page they want to connect to Syncly for 
automated customer service. We only access the Page they explicitly select.
```

---

#### ✅ Phase 4: Submit хийхийн өмнөх эцсийн шалгалт

| # | Шалгах зүйл | Статус |
|---|---|---|
| 1 | Privacy Policy live & accessible | ⬜ |
| 2 | Terms of Service live & accessible | ⬜ |
| 3 | App icon uploaded (1024x1024) | ⬜ |
| 4 | App domain set to `syncly.mn` | ⬜ |
| 5 | Business Verification дууссан эсвэл submitted | ⬜ |
| 6 | Test user + credentials бэлэн | ⬜ |
| 7 | Screencast бичлэг бүрэн (1080p+) | ⬜ |
| 8 | Permission бүрт тайлбар бичсэн | ⬜ |
| 9 | API calls хийгдсэн (сүүлийн 30 хоног) | ⬜ |
| 10 | OAuth redirect URI-ууд production URL руу чиглэсэн | ⬜ |
| 11 | Webhook URL production дээр ажиллаж байгаа | ⬜ |
| 12 | Data Use Checkup бөглөсөн | ⬜ |

---

### 🗓️ Хугацааны төлөвлөгөө

```
Өдөр 1: Business Info шинэчлэх + Business Verification submit
Өдөр 2: Privacy Policy + Terms of Service хуудас deploy хийх
Өдөр 3: App Settings бөглөх + Test User тохируулах + API calls хийх
Өдөр 4: Screencast бичлэг хийх (2 бичлэг)
Өдөр 5: Submission form бөглөх + Submit
Өдөр 6-12: Review хүлээх (ихэвчлэн 2-7 хоног)
```

---

### ⚠️ Түгээмэл REJECT болдог шалтгаанууд & шийдэл

| # | Reject шалтгаан | Шийдэл |
|---|---|---|
| 1 | Screencast тодорхой биш | 1080p, English UI, бүх flow харуулах |
| 2 | Permission-ийн тайлбар хангалтгүй | Дээрх загваруудыг ашиглах |
| 3 | Privacy Policy олдохгүй | Live URL, Meta crawler-т нээлттэй |
| 4 | Test user ажиллахгүй | Бодит Page холбосон test user |
| 5 | Business verification дуусаагүй | Verification эхлээд submit хийх |
| 6 | Шаардлагагүй permission хүссэн | Зөвхөн хэрэглэж буй 6 permission хүсэх |
| 7 | API call хийгээгүй | Submit-ийн өмнө permission бүрт 1+ call хийх |
| 8 | Wrong app type сонгосон | "Business" type сонгох |

---

> [!TIP]
> **Pro tip:** Хэрэв reject болвол, feedback-ийг нарийн уншаад, яг тэр зүйлийг засаад **3-5 хоногийн дотор** re-submit хийх. Meta бол хоёр дахь удаад илүү анхааралтай шалгадаг!
