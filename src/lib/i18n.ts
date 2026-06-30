/**
 * Vertmon Hub — i18n (Internationalization)
 * Supports: mn (Монгол), en (English), zh (中文)
 */

export type Locale = 'mn' | 'en' | 'zh';

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
    { code: 'mn', label: 'Монгол', flag: '🇲🇳' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
];

type TranslationMap = Record<string, string>;

const translations: Record<Locale, TranslationMap> = {
    mn: {
        // Nav
        'nav.dashboard': 'Хяналтын самбар',
        'nav.properties': 'Байрнууд',
        'nav.leads': 'Лийд',
        'nav.orders': 'Захиалга',
        'nav.customers': 'Харилцагч',
        'nav.products': 'Бүтээгдэхүүн',
        'nav.reports': 'Тайлан',
        'nav.settings': 'Тохиргоо',
        'nav.contracts': 'Гэрээ',
        'nav.viewings': 'Уулзалт',
        'nav.pipeline': 'Pipeline',
        'nav.ai_assistant': 'AI Туслах',
        'nav.marketing': 'Маркетинг',
        // Common
        'common.save': 'Хадгалах',
        'common.cancel': 'Цуцлах',
        'common.delete': 'Устгах',
        'common.edit': 'Засах',
        'common.search': 'Хайх',
        'common.filter': 'Шүүлтүүр',
        'common.export': 'Экспорт',
        'common.loading': 'Уншиж байна...',
        'common.no_data': 'Өгөгдөл олдсонгүй',
        'common.confirm': 'Баталгаажуулах',
        'common.back': 'Буцах',
        // Properties
        'property.available': 'Чөлөөтэй',
        'property.reserved': 'Захиалсан',
        'property.sold': 'Зарагдсан',
        'property.rented': 'Түрээслэсэн',
        'property.barter': 'Бартер',
        'property.rooms': 'өрөө',
        'property.floor': 'давхар',
        'property.size': 'м²',
        'property.price': 'Үнэ',
        // Leads
        'lead.new': 'Шинэ',
        'lead.contacted': 'Холбогдсон',
        'lead.viewing_scheduled': 'Уулзалт товлосон',
        'lead.offered': 'Санал илгээсэн',
        'lead.negotiating': 'Хэлэлцэж байна',
        'lead.closed_won': 'Амжилттай',
        'lead.closed_lost': 'Алдсан',
        'lead.urgency': 'Яаралтай',
        'lead.budget': 'Төсөв',
        // Dashboard
        'dashboard.total_revenue': 'Нийт орлого',
        'dashboard.total_leads': 'Нийт лийд',
        'dashboard.total_orders': 'Нийт захиалга',
        'dashboard.total_properties': 'Нийт байр',
        'dashboard.conversion_rate': 'Конверс',
    },
    en: {
        'nav.dashboard': 'Dashboard',
        'nav.properties': 'Properties',
        'nav.leads': 'Leads',
        'nav.orders': 'Orders',
        'nav.customers': 'Customers',
        'nav.products': 'Products',
        'nav.reports': 'Reports',
        'nav.settings': 'Settings',
        'nav.contracts': 'Contracts',
        'nav.viewings': 'Viewings',
        'nav.pipeline': 'Pipeline',
        'nav.ai_assistant': 'AI Assistant',
        'nav.marketing': 'Marketing',
        'common.save': 'Save',
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'common.search': 'Search',
        'common.filter': 'Filter',
        'common.export': 'Export',
        'common.loading': 'Loading...',
        'common.no_data': 'No data found',
        'common.confirm': 'Confirm',
        'common.back': 'Back',
        'property.available': 'Available',
        'property.reserved': 'Reserved',
        'property.sold': 'Sold',
        'property.rented': 'Rented',
        'property.barter': 'Barter',
        'property.rooms': 'rooms',
        'property.floor': 'floor',
        'property.size': 'sqm',
        'property.price': 'Price',
        'lead.new': 'New',
        'lead.contacted': 'Contacted',
        'lead.viewing_scheduled': 'Viewing Scheduled',
        'lead.offered': 'Offered',
        'lead.negotiating': 'Negotiating',
        'lead.closed_won': 'Won',
        'lead.closed_lost': 'Lost',
        'lead.urgency': 'Urgency',
        'lead.budget': 'Budget',
        'dashboard.total_revenue': 'Total Revenue',
        'dashboard.total_leads': 'Total Leads',
        'dashboard.total_orders': 'Total Orders',
        'dashboard.total_properties': 'Total Properties',
        'dashboard.conversion_rate': 'Conversion Rate',
    },
    zh: {
        'nav.dashboard': '仪表盘',
        'nav.properties': '房产',
        'nav.leads': '潜在客户',
        'nav.orders': '订单',
        'nav.customers': '客户',
        'nav.products': '产品',
        'nav.reports': '报告',
        'nav.settings': '设置',
        'nav.contracts': '合同',
        'nav.viewings': '看房',
        'nav.pipeline': '管道',
        'nav.ai_assistant': 'AI 助手',
        'nav.marketing': '营销',
        'common.save': '保存',
        'common.cancel': '取消',
        'common.delete': '删除',
        'common.edit': '编辑',
        'common.search': '搜索',
        'common.filter': '筛选',
        'common.export': '导出',
        'common.loading': '加载中...',
        'common.no_data': '暂无数据',
        'common.confirm': '确认',
        'common.back': '返回',
        'property.available': '可用',
        'property.reserved': '已预订',
        'property.sold': '已售',
        'property.rented': '已租',
        'property.barter': '以物换物',
        'property.rooms': '房间',
        'property.floor': '楼层',
        'property.size': '平方米',
        'property.price': '价格',
        'lead.new': '新',
        'lead.contacted': '已联系',
        'lead.viewing_scheduled': '已安排看房',
        'lead.offered': '已报价',
        'lead.negotiating': '谈判中',
        'lead.closed_won': '成交',
        'lead.closed_lost': '失败',
        'lead.urgency': '紧急',
        'lead.budget': '预算',
        'dashboard.total_revenue': '总收入',
        'dashboard.total_leads': '总潜客',
        'dashboard.total_orders': '总订单',
        'dashboard.total_properties': '总房产',
        'dashboard.conversion_rate': '转化率',
    },
};

/** Get translation for a key */
export function t(key: string, locale: Locale = 'mn'): string {
    return translations[locale]?.[key] || translations.mn[key] || key;
}

/** Get all translations for a locale */
export function getTranslations(locale: Locale): TranslationMap {
    return translations[locale] || translations.mn;
}

/** Get locale from localStorage */
export function getStoredLocale(): Locale {
    if (typeof window === 'undefined') return 'mn';
    return (localStorage.getItem('vertmonhub_locale') as Locale) || 'mn';
}

/** Save locale to localStorage */
export function setStoredLocale(locale: Locale): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem('vertmonhub_locale', locale);
    }
}
