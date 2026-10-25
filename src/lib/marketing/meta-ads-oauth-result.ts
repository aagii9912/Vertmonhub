/**
 * «Meta Ads холбох» OAuth callback-ийн үр дүн: callback нь `/marketing?tab=records&meta_ads=<код>` руу
 * буцаана (MetaSpendSync «Бүртгэл» табд байрладаг), MetaSpendSync кодыг доорх мессежээр харуулна.
 * Клиентэд аюулгүй — серверийн импортгүй.
 */
export const META_ADS_OAUTH_RETURN = { path: '/marketing', tab: 'records', param: 'meta_ads' } as const;

type Notice = { tone: 'success' | 'info' | 'danger'; message: string };
const RETRY = '«Meta Ads холбох» товчоос дахин эхлүүлнэ үү.';

export const META_ADS_OAUTH_NOTICES = {
    connected: { tone: 'success', message: 'Meta Ads холбогдлоо.' },
    system_token: { tone: 'info', message: 'Системийн хэрэглэгчийн токен идэвхтэй тул Meta Ads-ийг хэрэглэгчээр холбох шаардлагагүй. Зарын дансыг админ сонгоно.' },
    state_error: { tone: 'danger', message: `Холболтын хамгаалалтын шалгалт (state) таарсангүй эсвэл 10 минутын хугацаа нь дууссан. Хуудсыг шинэчлээд ${RETRY}` },
    denied: { tone: 'danger', message: `Facebook дээр зөвшөөрөл өгөөгүй тул Meta Ads холбогдсонгүй. ${RETRY} Зарын дансны эрхийг зөвшөөрнө үү.` },
    missing_code: { tone: 'danger', message: `Facebook-оос зөвшөөрлийн код ирсэнгүй. ${RETRY}` },
    permission_error: { tone: 'danger', message: 'Meta Ads холбоход маркетингийн тайлан засах эрх шаардлагатай. Админдаа хандана уу.' },
    session_error: { tone: 'danger', message: `Холболтыг эхлүүлсэн хэрэглэгч эсвэл төсөл өөрчлөгдсөн байна. Зөв төсөл сонгосон эсэхээ шалгаад ${RETRY}` },
    config_error: { tone: 'danger', message: 'Meta Ads app-ийн тохиргоо (App ID, нууц түлхүүр) серверт дутуу байна. Системийн админд хандана уу.' },
    token_error: { tone: 'danger', message: `Meta-гаас нэвтрэх токен авч чадсангүй. ${RETRY} Дахин бүтэхгүй бол алдааны дэлгэрэнгүй серверийн логт («[Meta Ads OAuth]») бичигдсэн байгаа.` },
    ads_read_error: { tone: 'danger', message: `Зарын дансны (ads_read) эрх олгогдоогүй. ${RETRY} Зөвшөөрөх цонхонд зарын дансаа сонгож, Business portfolio-д тухайн дансанд хандах эрхтэй эсэхээ шалгана уу.` },
    save_error: { tone: 'danger', message: 'Meta Ads холболтыг хадгалж чадсангүй. Дахин оролдоно уу.' },
    connection_error: { tone: 'danger', message: 'Meta-тай холбогдож чадсангүй (сүлжээ тасарсан эсвэл хугацаа хэтэрсэн). Түр хүлээгээд дахин оролдоно уу.' },
} as const satisfies Record<string, Notice>;

export type MetaAdsOAuthResult = keyof typeof META_ADS_OAUTH_NOTICES;

const UNKNOWN: Notice = { tone: 'danger', message: 'Meta Ads холболт амжилтгүй боллоо. App-ийн ads_read эрх, Meta зөвшөөрөл болон нэвтрэх тохиргоог шалгана уу.' };

/** URL-ын `meta_ads` утгын мессеж; утга байхгүй бол null, танигдаагүй код бол ерөнхий алдаа. */
export function metaAdsOAuthNotice(result: string | null): Notice | null {
    if (!result) return null;
    return Object.hasOwn(META_ADS_OAUTH_NOTICES, result) ? META_ADS_OAUTH_NOTICES[result as MetaAdsOAuthResult] : UNKNOWN;
}
