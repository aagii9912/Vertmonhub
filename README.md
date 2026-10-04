# Vertmon Hub 🏢

**AI-Powered Real Estate Sales & CRM Platform**

> Vertmon компанийн үл хөдлөх хөрөнгийн борлуулалт, CRM, маркетингийн дотоод удирдлагын платформ.

---

## ✨ Онцлог

### 🤖 AI туслах
- OpenAI GPT дээр ажилладаг dashboard туслах (`/dashboard/ai-assistant`, ⌘J)
- Лид, уулзалт, гэрээ, байр, тайлангийн мэдээллээс хариулж, үйлдлийг баталгаажуулалттай гүйцэтгэнэ (RBAC)
- Байгууллагын мэдлэг ба FAQ-г «AI тохируулга»-аас удирдана
- Монгол хэлний бүрэн дэмжлэг

### 🏠 Үл Хөдлөх Хөрөнгө
- Байр, орон сууц, оффис, газрын бүртгэл
- Төсөл, байршил, м.кв, давхар, өрөөний тоо
- Зураг, виртуал тур, видео холбоос
- Статус удирдлага (available / reserved / sold / rented)

### 📋 CRM & Leads
- Lead удирдлага (new → contacted → viewing → negotiating → closed)
- Үзлэгийн бүртгэл (property viewings)
- AI-аар lead scoring, talking points
- HubSpot integration бэлтгэл

### 📊 Dashboard (11 модуль)
- Борлуулалтын статистик, графикууд
- Харилцагчийн удирдлага (VIP автомат)
- Захиалга, бүтээгдэхүүний CRUD
- Тайлан, экспорт
- Санал асуулга (Surveys)
- AI тохиргоо (instructions, emotion, knowledge base)
- **Role-Based Access (дүрээр хандалт хязгаарлана)**

### 📈 Маркетинг (8 хуудас)
- Кампанит ажил, зар сурталчилгаа
- Сошиал медиа удирдлага
- Мессеж, имэйл маркетинг
- Бренд тохиргоо, хуанли

### 🔔 Мэдэгдэл & Чат
- Facebook/Instagram DM-ийг Inbox-д хадгалдаг webhook (автомат хариугүй)
- Push notification (Web Push)
- Бодит цагийн мэдэгдэл (Realtime)
- Inbox — бүх ярилцлагыг нэг дороос

---

## 🛠️ Техникийн Стек

| Технологи | Хувилбар | Зориулалт |
|-----------|----------|-----------|
| Next.js | 16.1 | Web framework (App Router) |
| React | 19.2 | UI library |
| TypeScript | 5.x | Type safety |
| Supabase | SSR + Auth | Database + Auth + Storage |
| TailwindCSS | v4 | Styling |
| TanStack Query | v5 | Data fetching & caching |
| Recharts | v3.7 | Charts & graphs |
| Sentry | v10 | Error monitoring |
| Resend | v6.7 | Email sending |
| Zod | v4 | Schema validation |
| Playwright | v1.58 | E2E testing |
| Vitest | v4 | Unit testing |

---

## 🚀 Quick Start

### 1. Install

```bash
git clone <your-repo>
cd vertmonhub
npm install
```

### 2. Environment Setup

`.env.local` файл үүсгэх (`.env.local.example`-ыг жишиг болгох):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI
GEMINI_API_KEY=your_gemini_api_key

# Facebook
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_PAGE_ACCESS_TOKEN=your_token
FACEBOOK_VERIFY_TOKEN=your_verify_token
FACEBOOK_PAGE_ID=your_page_id

# Sentry (optional)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
```

### 3. Database Setup

```bash
# Supabase дээр project үүсгэсний дараа:
# SQL Editor → supabase/vertmonhub_complete_setup.sql ажиллуулах
# Дараа нь migrations/ дотор байгаа файлуудыг дарааллаар ажиллуулах
```

### 4. Run

```bash
npm run dev
# → http://localhost:3001
```

---

## 📁 Төслийн Бүтэц

```
vertmonhub/
├── src/
│   ├── app/
│   │   ├── dashboard/         # 14 модуль (leads, properties, viewings, contracts, ...)
│   │   ├── api/               # 23 API route бүлэг
│   │   ├── marketing/         # Маркетинг (8 хуудас)
│   │   ├── admin/             # Админ панел
│   │   └── auth/              # Нэвтрэх
│   ├── components/            # UI компонентууд (63 файл)
│   │   ├── dashboard/         # Dashboard-д зориулсан
│   │   ├── cart/              # Сагсны систем
│   │   ├── chat/              # Чат компонент
│   │   └── ui/                # Дахин ашиглах UI (Button, Card, Badge...)
│   ├── contexts/              # AuthContext (хэрэглэгч + role)
│   ├── hooks/                 # React Query hooks (10)
│   ├── lib/
│   │   ├── ai/                # Dashboard AI туслах (orchestrator, data-assistant, openai)
│   │   ├── rbac.ts            # Дүрд суурилсан хандалт (RBAC)
│   │   ├── services/          # Backend services (5)
│   │   ├── webhook/           # FB/IG webhook
│   │   └── utils/             # Utility functions
│   ├── types/                 # TypeScript types
│   └── middleware.ts          # Auth + Rate limiting middleware
├── supabase/
│   ├── migrations/            # 52 migration файл
│   └── vertmonhub_complete_setup.sql
├── e2e/                       # Playwright тестүүд (8)
├── docs/                      # Баримт бичгүүд (workflow, review, rollout тэмдэглэл)
├── REPORTS/                   # Гэрээний тайлангууд
└── scripts/                   # Utility скриптүүд
```

---

## 🗄️ Өгөгдлийн Сан (13+ хүснэгт)

| Хүснэгт | Тайлбар |
|---------|---------|
| `shops` | Компани / дэлгүүр (AI тохиргоо, FB/IG холболт) |
| `properties` | Үл хөдлөх хөрөнгө (type, price, size, location, GPS) |
| `leads` | Борлуулалтын lead (status pipeline, budget, preferences) |
| `property_viewings` | Үзлэгийн бүртгэл |
| `customers` | Харилцагчид (VIP, tags, order history) |
| `orders` | Захиалга |
| `order_items` | Захиалгын задаргаа |
| `products` | Бүтээгдэхүүн |
| `chat_history` | AI чат түүх |
| `ai_memory` | AI санах ой (хэрэглэгчийн preference) |
| `user_roles` | Ажилчдын дүр (admin, sales_manager, marketing, viewer) |
| `admins` | Админ хэрэглэгчид |

---

## 🤖 AI Тохиргоо

**Model:** OpenAI GPT (`OPENAI_MODEL`, анхдагч `gpt-5.6-luna`) — dashboard AI туслах  
**Gemini:** зөвхөн lead form-ийн угтах хариу, өрсөлдөгчийн шинжилгээ, судалгааны хураангуй  
FB/IG DM-ийн автомат хариулагч (бот) 2026-10-04-нд хасагдсан; DM-ийг Inbox-оос хүн хариулна.

---

## 🔐 Ажилчдын Дүр (RBAC)

| Дүр | Тайлбар | Хандалт |
|------|---------|--------|
| `admin` | Админ | Бүх модуль, засах/устгах эрх, админ панел |
| `sales_manager` | Борлуулалтын менежер | Properties, Leads, Customers, Orders, AI Assistant, Reports |
| `marketing` | Маркетинг | Marketing, Surveys, Reports, AI Assistant, AI Settings |
| `viewer` | Зөвхөн харагч | Dashboard (зөвхөн унших), Reports |

---

## 🧪 Тест

```bash
# Unit тест
npm run test

# Type шалгалт
npm run typecheck

# E2E тест
npx playwright test

# Lint
npm run lint
```

---

## 📦 Deploy

Vercel дээр `main` branch-аас автоматаар deploy хийгдэнэ (`sin1`). Env-ийн жагсаалт: [.env.example](./.env.example)

```bash
npm run build
```

---

## 🔐 Аюулгүй Байдал

- Supabase Row Level Security (RLS) бүрэн хэрэгжсэн
- **Role-Based Access Control (RBAC)** — `user_roles` хүснэгтээр
- Server-side service role key хамгаалалт
- Auth middleware бүх API route-д
- Sentry error tracking
- Environment variables хамгаалалт

---

## 📄 Лиценз

MIT License

---

## 📞 Холбоо Барих

Асуулт, санал байвал issue үүсгэнэ үү.

---

Built with ❤️ using [Next.js](https://nextjs.org) · [Supabase](https://supabase.com) · [Google Gemini](https://ai.google.dev) · [Tailwind CSS](https://tailwindcss.com)
