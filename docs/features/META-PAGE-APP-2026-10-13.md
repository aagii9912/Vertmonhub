# Facebook Page холболтыг «Vertmon Hub» апп руу шилжүүлэх (2026-10-13)

**Асуудал:** Elysium болон бусад төслийн FB пэйжийн мэдээлэл Hub-д ирэхгүй байв.

- Аль ч төсөлд пэйж холбогдоогүй: `facebook_page_id` NULL, `social_insights_daily` 0 мөр.
- Пэйж холбох, DM, Lead Ads-д ашигладаг хуучин апп (`FACEBOOK_APP_ID`) Meta-д хаагдсан. App токеноор Graph-аас асуухад `API access blocked` (code 200) гэж хариулдаг. Тиймээс «Facebook хуудас холбох» дарсан ч бүтэхгүй.
- Meta Ads холболтод ажилладаг, Published «Vertmon Hub» апп (`META_ADS_APP_ID`) хэвийн.

**Эзэмшигчийн шийдвэр (2026-10-13):** пэйжийн холболтыг «Vertmon Hub» апп руу шилжүүлнэ.

## Кодын өөрчлөлт

- `lib/facebook/page-app.ts` нь Page апп-ыг сонгоно. Анхдагчаар `META_ADS_APP_ID/SECRET` («Vertmon Hub») ашиглана. `META_PAGE_APP=legacy` бол хуучин `FACEBOOK_APP_*` руу буцна.
- Page OAuth (`/api/auth/facebook`, `/api/auth/instagram`), Page/IG-ийн Graph дуудлагын `appsecret_proof`, DM илгээх, профайл, Lead Ads, `subscribed_apps` бүгд нэг аппыг ашиглана. Page токен ба proof хоёр өөр аппынх байвал Graph татгалздаг.
- Facebook Login for Business: `META_PAGE_LOGIN_CONFIG_ID` тохируулсан бол Page, Instagram хоёр урсгалд `config_id`-аар явна. Тохируулаагүй бол `scope` параметрээр явна.
- `/api/webhook` болон `/api/meta/data-deletion` гарын үсгийг манай хоёр аппын аль нэгнийх таарвал хүлээн авна. Шилжилтийн үед хуучин аппын subscription ч илгээж болно.
- `.env.example`, `lib/env.ts` (зөвлөмжтэй `META_PAGE_LOGIN_CONFIG_ID`) шинэчлэгдсэн.

## Эзэмшигчийн хийх алхам (Meta for Developers → «Vertmon Hub» апп)

1. **Use cases → Add**:
   - «Manage everything on your Page»: `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `read_insights`, `pages_manage_metadata`. `pages_read_user_content`-гүй бол нийтлэлийн жагсаалт (`comments.summary`) code 10 буцаана.
   - DM-д «Engage with customers on Messenger from Meta»: `pages_messaging`.
   - Lead Ads-д «Capture & manage ad leads»: `leads_retrieval`, `pages_manage_ads`.
   - Instagram хэрэгтэй бол `instagram_basic`, `instagram_manage_insights`, `instagram_manage_messages`, `instagram_manage_comments`.
2. **Facebook Login for Business → Configurations → Create:**
   - Нэр: «Vertmon Hub — Page холболт».
   - Token: User access token.
   - Assets: Pages (Instagram хэрэгтэй бол Instagram accounts).
   - Дээрх эрхүүд, мөн `business_management`.
   - Үүссэн **Configuration ID**-г Vercel-ийн `META_PAGE_LOGIN_CONFIG_ID`-д оруулна (эсвэл Claude-д өгнө).
3. **Facebook Login for Business → Settings → Valid OAuth Redirect URIs:** дараах хоёрыг нэмнэ:
   - `https://www.vertmon.mn/api/auth/facebook/callback`
   - `https://www.vertmon.mn/api/auth/instagram/callback`
4. **Эрхийн түвшин:** App Review-гээр Advanced Access авах хүртэл зөвхөн аппад үүрэгтэй хүн (Admin/Developer/Tester) өөрийн удирддаг пэйжийг холбож чадна.
   - Elysium пэйжийн **admin** хүнийг аппын App roles-д Tester/Developer-ээр нэмнэ.
   - Эсвэл `pages_read_engagement`, `read_insights`-д App Review хийлгэнэ. Business verification шаардлагатай.
5. **Webhooks (DM, Lead Ads хэрэгтэй бол):** Products → Webhooks → Page:
   - Callback URL: `https://www.vertmon.mn/api/webhook`.
   - Verify token: Vercel-ийн `FACEBOOK_VERIFY_TOKEN`-ий утга. Мэдэхгүй бол Vercel-д шинэ утга оноож, redeploy хийгээд түүнийгээ оруулна.
   - Fields: `messages`, `messaging_postbacks`, `leadgen`.
6. **Hub дээр:** Маркетинг → Сошиал хэсэгт төслөө (Elysium Residence) сонгоод «Facebook хуудас холбох»-ыг дарж, Elysium пэйжийг сонгоно. Пэйж холбогдоход Hub `subscribed_apps`-ийг шинэ аппаар бүртгэнэ.

Холбогдсоны дараа «Сошиал» хуудасны синк ба cron `social_insights_daily`-г бөглөнө. Лхагвагийн маркетингийн тайлан Facebook хуудасны тоог шууд авна.

## Төлөв (2026-10-13, Claude Chrome-оор тохируулсан)

- «Vertmon Hub» апп: Page, Messenger, Lead Ads, Instagram use case нэмсэн. Дээрх бүх эрх «Ready for testing» (standard access) төлөвтэй.
- Login for Business тохиргоо «Vertmon Hub Page connect», ID `1480354417330230`. 14 эрхтэй, `ads_management` ороогүй. Vercel production-д `META_PAGE_LOGIN_CONFIG_ID` болгон тохируулж redeploy хийсэн.
- Redirect URI: `/api/auth/facebook/callback` ба `/api/auth/instagram/callback` нэмсэн.
- App roles: зөвхөн эзэмшигч (Administrator) байна. Тэр Elysium пэйжийн admin тул Tester нэмэх шаардлагагүй. Бусад хүн өөр пэйж холбох бол Tester болгох, эсвэл App Review хийлгэнэ.
- Elysium Residence пэйж (676357242225387) болон @elysiumbymoncon Instagram холбогдсон. Sync хийхэд 240 өдрийн мөр, 25 нийтлэл хадгалагдсан. Lead Ads `subscribed_apps` идэвхтэй.
- **Үлдсэн ажил:** Webhooks → Page-ийн callback URL болон verify token. Verify token нь нууц тул эзэмшигч өөрөө оруулна. Дараа нь `messages`, `messaging_postbacks`, `leadgen` талбаруудыг subscribe хийнэ. Үүнийг хийх хүртэл DM болон Lead Ads шинэ апп руу ирэхгүй.
