/**
 * `ad_campaigns` хоёр төрлийн мөртэй бөгөөд тэдгээрийг нэг нийлбэрт хольж болохгүй:
 *  - Meta-аас синк хийсэн кампанит ажил (`platform = 'facebook'`, `external_id`-тай): зардал, CPC,
 *    төсөв нь төслийн сонгосон зарын дансны валютаар (ихэвчлэн USD, төгрөгт хөрвүүлээгүй). Кампанит
 *    ажлын синк, insights, cron зөвхөн тэр дансны кампанит ажлыг шинэчилнэ; үзүүлэлт нь сүүлийн
 *    синкийн хугацааных (анхдагч сүүлийн 30 хоног).
 *  - Hub-д гараар бүртгэсэн төлөвлөгөөт зар (`external_id`-гүй): Meta дээр зар үүсгэдэггүй, үр дүнгүй;
 *    төсөв нь ₮ (бүртгэх формын «Төсөв (₮)»).
 * Энэ дүрмийг Зар сурталчилгааны хуудас ба AI маркетингийн нэгтгэл хоёулаа хэрэглэнэ.
 */
export interface AdCampaignOrigin {
    platform?: string | null;
    external_id?: string | null;
}

export function isMetaSyncedCampaign(campaign: AdCampaignOrigin): boolean {
    return campaign.platform === 'facebook' && !!campaign.external_id;
}
