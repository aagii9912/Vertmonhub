# 🔐 Facebook OAuth Бодит Горимд Тохируулах Заавар

## 📋 Одоогийн байдал

| Тохиргоо | Төлөв | Утга |
|----------|-------|------|
| **FACEBOOK_APP_ID** | ✅ Тохируулсан | `1412919253535199` |
| **FACEBOOK_APP_SECRET** | ❌ Шаардлагатай | Дор авах заавар |
| **Privacy Policy** | ✅ Тохируулсан | `https://smarthub-opal.vercel.app/privacy` |
| **App Status** | ✅ Published | Бодит горимд |

---

## 🔧 Алхам 1: App Secret авах

1. **Facebook Developers** руу орно:
   ```
   https://developers.facebook.com/apps/1412919253535199/settings/basic/
   ```

2. **App secret** хэсэгт "Show" товч дарна

3. Facebook нууц үгээ оруулна

4. Гарч ирсэн **App Secret**-г хуулж авна (жишээ: `abc123def456...`)

---

## 🔧 Алхам 2: Valid OAuth Redirect URI нэмэх

1. **Facebook Login for Business → Settings** руу очно:
   ```
   https://developers.facebook.com/apps/1412919253535199/fb-login/settings/
   ```

2. **Valid OAuth Redirect URIs** хэсэгт дараах URL нэмнэ:
   ```
   https://smarthub-opal.vercel.app/api/auth/facebook/callback
   ```

3. **Save changes** товч дарна

---

## 🔧 Алхам 3: Vercel Environment Variables тохируулах

1. **Vercel Dashboard** руу орно:
   ```
   https://vercel.com/aagii9912s-projects/smarthub/settings/environment-variables
   ```

2. Дараах environment variables нэмнэ:

   | Key | Value | Environments |
   |-----|-------|--------------|
   | `FACEBOOK_APP_SECRET` | (Алхам 1-д авсан secret) | Production, Preview |

3. **Save** товч дарна

4. **Redeploy** хийнэ

---

## 🔧 Алхам 4: Messenger Permissions шалгах

1. **Use cases** руу очно:
   ```
   https://developers.facebook.com/apps/1412919253535199/use-cases/
   ```

2. Дараах permissions идэвхтэй эсэхийг шалгана:
   - ✅ `pages_show_list`
   - ✅ `pages_messaging`
   - ✅ `pages_read_engagement`
   - ✅ `pages_manage_metadata`
   - ✅ `public_profile`

---

## 🔧 Алхам 5: Webhook тохируулах (Messenger)

1. **Messenger → Settings** руу очно:
   ```
   https://developers.facebook.com/apps/1412919253535199/messenger/settings/
   ```

2. **Callback URL** тохируулна:
   ```
   https://smarthub-opal.vercel.app/api/webhook
   ```

3. **Verify Token**:
   ```
   smarthub_verify_token_2024
   ```

4. **Subscription Fields** сонгоно:
   - ✅ `messages`
   - ✅ `messaging_postbacks`

---

## ✅ Шалгах

1. https://smarthub-opal.vercel.app/setup руу очно
2. "Facebook-ээр холбох" товч дарна
3. Facebook нэвтэрч, Page сонгоно
4. Dashboard дээр "Чатбот идэвхтэй" гэж харагдах ёстой

---

## 🐛 Түгээмэл асуудлууд

### "Invalid OAuth redirect URI"
- Facebook App → Settings → Valid OAuth Redirect URIs шалгах
- URL яг таарч байгаа эсэхийг шалгах (trailing slash)

### "App secret missing"
- Vercel Environment Variables дээр `FACEBOOK_APP_SECRET` нэмсэн эсэхийг шалгах
- Redeploy хийсэн эсэхийг шалгах

### "Pages not showing"
- Facebook Business account-тай эсэхийг шалгах
- Page admin эрхтэй эсэхийг шалгах

---

## 📞 Холбоо барих

Асуудал гарвал: aagii9912@gmail.com

