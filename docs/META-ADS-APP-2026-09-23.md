# Meta Ads app — 2026-09-23

Meta Developers-д `Vertmon Hub` нэртэй Marketing API app үүсгэсэн:

- App ID: `1422020356521451`
- Facebook Login for Business configuration: `Vertmon Ads Read` (`2499547073899722`)
- Configuration permissions: зөвхөн `ads_read`; user access token
- OAuth redirect: `https://www.vertmon.mn/api/marketing/facebook/ads/connect/callback`
- App domain: `vertmon.mn`
- App status: unpublished; `ads_read` нь app role-той хэрэглэгчид testing-д бэлэн
- Production `20260923120000_meta_ads_app_connection.sql` migration: хэрэглэсэн;
  хоёр шинэ `shops` багана шалгагдсан

Хуучин `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` нь Page, Instagram, DM,
webhook-д хэвээр ашиглагдана. Шинэ app-ийн `META_ADS_APP_ID`,
`META_ADS_APP_SECRET`, `META_ADS_LOGIN_CONFIG_ID` нь зөвхөн зарын тайлангийн
холболтод хамаарна. `TOKEN_ENCRYPTION_KEY`-ийн өмнөх байтыг өөрчилж болохгүй.

Graph API Explorer v26.0 дээр шинэ app-ийн `ads_read` эрхтэй түр token-оор
`/me/adaccounts` амжилттай уншигдсан. Энэ Facebook хэрэглэгчид зөвхөн
`act_1165579117419200` (хувийн данс, USD, business_name хоосон) харагдав.
Түүний кампанит ажлууд үл хөдлөхийн төсөл биш байсан тул Vertmon/Mandala
Garden-ийн зарын данс гэж сонгоогүй. Production-д бодит зардал импортлоогүй.

## Үлдсэн алхам

1. App secret-ийг Meta App settings → Basic-ээс хэрэглэгч өөрөө авч,
   Vercel production орчинд `META_ADS_APP_SECRET` гэж тохируулна. App ID болон
   config ID-г дээрх утгаар тохируулна. Хуучин Facebook env-г сольж болохгүй.
2. Тусдаа Ads OAuth кодыг deploy хийнэ. Migration аль хэдийн production-д
   хэрэглэгдсэн.
3. Vertmon-ийн бодит зарын дансанд эрхтэй Facebook хэрэглэгчээр нэвтэрч,
   app-ийн `ads_read` зөвшөөрлийг өгнө. App unpublished үед тэр хэрэглэгч
   app role-той байх ёстой; app review/publish шаардлагыг Meta-д шалгана.
4. Зөв зарын дансыг ID, нэр, валюттай нь тулгаж гараар сонгоно. USD зэрэг
   гадаад валютын MNT ханшийг санхүүгийн баталсан эх сурвалжаар оруулна.
5. Эхний синкийн нэг өдрийн зарын дансны нийт дүнг Ads Manager-тай ижил
   цагийн бүс, валютаар тулгана. Cron-ийн дараагийн давталтыг мөн шалгана.

User token хугацаатай тул автоматаар удаан хугацаанд ажиллуулахад
хугацаа дуусахаас өмнө дахин холбох шаардлага гарна. Meta-ийн
[Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)
заавар автомат Ads Insights-д system-user token зөвлөдөг; түүнд зөв бизнес
портфель болон asset access хэрэгтэй. Одоогийн app бизнес портфельгүй тул
system-user сонголт нээгдээгүй.
