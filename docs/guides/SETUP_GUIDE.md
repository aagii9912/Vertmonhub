# SmartHub Setup Guide 🛠️

> Энэхүү заавар нь project-ийг анх удаа ажиллуулахад шаардлагатай бүх алхмуудыг агуулна.

---

## 📋 Шаардлага

- **Node.js**: 18.17.0 ба түүнээс дээш
- **npm**: Сүүлийн хувилбар
- **Git**: Хувилбар удирдлага
- **Supabase account**: Database
- **Clerk account**: Authentication
- **Facebook Developer account**: Messenger integration (optional)

---

## 🚀 Алхам 1: Repository Clone

```bash
git clone <repository-url>
cd smarthub
```

---

## 📦 Алхам 2: Dependencies суулгах

```bash
npm install
```

---

## ⚙️ Алхам 3: Environment Variables

`.env.local` файл үүсгэнэ:

```bash
cp .env.production.example .env.local
```

Дараах утгуудыг оруулна:

### Supabase (Заавал)

Supabase dashboard-аас авна: Settings → API

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Clerk Authentication (Заавал)

Clerk dashboard-аас авна: API Keys

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### Facebook Integration (Сонголттой)

Facebook Developer Console-аас авна:

```bash
FACEBOOK_PAGE_ACCESS_TOKEN=EAAxxxx...
FACEBOOK_VERIFY_TOKEN=your_custom_verify_token
FACEBOOK_APP_SECRET=xxxxx
```

### AI APIs (Сонголттой)

```bash
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

---

## 🗃️ Алхам 4: Database Setup

### 4.1 Supabase Project үүсгэх

1. [supabase.com](https://supabase.com) дээр бүртгүүлнэ
2. New Project үүсгэнэ
3. Region сонгоно (Asia - Singapore recommended)
4. Strong password тохируулна

### 4.2 Database Schema үүсгэх

Supabase Dashboard → SQL Editor дээр:

`supabase/migrations/` folder дотор байгаа SQL файлуудыг дарааллаар ажиллуулна:

```
001_initial_schema.sql
002_triggers.sql
003_rls_policies.sql
...
```

Эсвэл хамгийн сүүлийн combined migration файлыг ажиллуулна.

---

## 🚀 Алхам 5: Development Server

```bash
npm run dev
```

App: [http://localhost:3001](http://localhost:3001)

---

## ✅ Алхам 6: Verify Setup

1. Landing page: `http://localhost:3001` нээгдэнэ
2. Sign in with Clerk: `/auth/signin` руу redirect хийнэ
3. Shop setup: Анх удаа нэвтрэхэд shop үүсгэх wizard гарна
4. Dashboard: `/dashboard` дээр орно

---

## 📱 PWA Feature (Optional)

App нь PWA байдлаар суулгагдах боломжтой:
- iOS Safari: Share → Add to Home Screen
- Android Chrome: Install prompt автоматаар гарна

---

## 🐛 Troubleshooting

### "Failed to fetch" алдаа

- `.env.local` файлд Supabase URL, API keys зөв эсэхийг шалгана
- Supabase RLS policies идэвхжсэн эсэхийг шалгана

### Authentication redirect loop

- Clerk API keys зөв эсэхийг шалгана
- `middleware.ts` файл дахь protected routes шалгана

### Database connection error

- `SUPABASE_SERVICE_ROLE_KEY` зөв эсэхийг шалгана
- Supabase project pause хийгдээгүй эсэхийг шалгана

---

## 📞 Холбоо барих

Тусламж хэрэгтэй бол project owner-т хандана уу!
