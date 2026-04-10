/**
 * Landing Page CMS — Default Content (fallback when DB is empty)
 * Extracted from the original hardcoded page.tsx
 */

import type { LandingContent } from './types';

export const defaultLandingContent: LandingContent = {
    hero: {
        badge: "Борлуулалтын шинэ стандарт Syncly",
        headingLine1: "0 ажилтан.",
        headingHighlight: "5х орлогын өсөлт.",
        sub: "Facebook, Instagram дээрх чат бүрд хариулж, захиалга, төлбөр тооцоог автоматаар хүлээн авч баталгаажуулна.",
        ctaText: "5x өсөлтөө эхлүүлэх",
    },

    metrics: [
        { value: "32", label: "Бизнес хэрэглэгч" },
        { value: "28+", label: "Мессеж боловсруулсан" },
        { value: "3,5K+", label: "Захиалга" },
        { value: "98%", label: "Сэтгэл ханамж" },
    ],

    features: {
        sectionLabel: "Боломжууд",
        sectionTitle: "Бизнесээ удирдахад хэрэгтэй бүх зүйл",
        sectionDesc: "Тусгай борлуулалч agent, бараа бүтээгдэхүүний үлдэгдэл, захиалгын мэдээлэл, тайлан, хэрэглэгчийн мэдээлэл бүгд нэг дор",
        items: [
            {
                title: "Тусгай Борлуулагч Agent",
                desc: "Facebook, Instagram дээр 24/7 хэрэглэгчидтэй харилцаж, бүтээгдэхүүн үйлчилгээг санал болгоно.",
            },
            {
                title: "Хянах самбар",
                desc: "Бараа бүтээгдэхүүний үлдэгдэл, борлуулалт, захиалгын тоон мэдээлэл, хэрэглэгчдийн бүртгэлийн мэдээллийг нэг дороос хянана.",
            },
            {
                title: "5 минутын суулгалт",
                desc: "Facebook, Instagram хуудастайгаа холбож, бүтээгдэхүүний мэдээллээ оруулаад Agent шууд ажиллаж эхэлнэ.",
            },
            {
                title: "Нэгдсэн төлбөрийн систем",
                desc: "Ганц товшилтоор шууд төлбөр хүлээн авч, захиалга автоматаар бүртгэнэ.",
            },
            {
                title: "CRM систем",
                desc: "Хэрэглэгчийн мэдээллийг автоматаар бүртгэж, хүргэлтийн хаяг, санал гомдол цуглуулна.",
            },
        ],
    },

    how_it_works: {
        sectionLabel: "Бүртгүүлэхэд хэцүү юу?",
        sectionTitle: "Ердөө 3-н алхам",
        items: [
            {
                step: "01",
                title: "Бүртгүүлэх",
                desc: "Бүртгэлийн мэдээллээ оруулж, Facebook, Instagram хуудастайгаа холбоно.",
            },
            {
                step: "02",
                title: "Бүтээгдэхүүн нэмэх",
                desc: "Бүтээгдэхүүн, үйлчилгээний мэдээллээ нэмж, Тусгай Борлуулагч agent-ийн тохиргоогоо хийнэ.",
            },
            {
                step: "03",
                title: "Борлуулалт эхлэх",
                desc: "Тусгай Борлуулагч agent 24/7 ажиллаж, борлуулалтаа шууд хийж эхэлнэ.",
            },
        ],
    },

    social_proof: {
        sectionLabel: "Syncly-д нэгдсэнээр та…",
        sectionTitle: "Тоо худлаа хэлдэггүй!",
        items: [
            {
                category: "Цаг Хэмнэлт",
                stat: "8+ цаг",
                statSuffix: "/өдөр",
                result: "Бизнесээ дараагийн түвшинд гаргахад зарцуулна",
            },
            {
                category: "Орлого өсөлт",
                stat: "₮500K+",
                statSuffix: "/сар",
                result: "Бизнесээ өргөжүүлнэ",
            },
            {
                category: "Бүтээмж нэмэлт",
                stat: "5x",
                statSuffix: " илүү",
                result: "Зардал буурна",
            },
        ],
    },

    pricing: {
        sectionLabel: "Үнийн санал",
        sectionTitle: "Таны бизнест санал болгох",
        starter: {
            label: "Starter",
            desc: "Жижиг бизнест",
            monthly: { price: "₮179,000", period: "/сар" },
            yearly: { price: "₮1,790,000", period: "/жил", savings: "2 сар үнэгүй" },
            features: ["1 Facebook/Instagram хуудас", "2,000 мессеж/сар", "50 бүтээгдэхүүн", "Тусгай борлуулагч Agent"],
        },
        pro: {
            label: "Pro",
            desc: "Дунд бизнест",
            recommended: true,
            monthly: { price: "₮379,000", period: "/сар" },
            yearly: { price: "₮3,379,000", period: "/жил", savings: "2 сар үнэгүй" },
            features: ["3 Facebook/Instagram хуудас", "10,000 мессеж/сар", "300 бүтээгдэхүүн", "Тусгай борлуулагч Agent", "QPay холболт", "Тайлан, аналитик"],
        },
        enterprise: {
            label: "Enterprise",
            desc: "Том байгууллагуудад",
            monthly: { price: "Тохиролцоно", period: "" },
            yearly: { price: "Тохиролцоно", period: "" },
            features: ["Хязгааргүй хуудас", "Хязгааргүй бүтээгдэхүүн", "Тусгай борлуулагч Agent", "24/7 дэмжлэг", "Хувийн менежер"],
        },
    },

    comparison: [
        { name: "Facebook/Instagram хуудас", starter: "1", pro: "3", enterprise: "Хязгааргүй" },
        { name: "Сарын мессеж", starter: "2,000", pro: "10,000", enterprise: "Хязгааргүй" },
        { name: "Бүтээгдэхүүн", starter: "50", pro: "300", enterprise: "Хязгааргүй" },
        { name: "Тусгай борлуулагч Agent", starter: true, pro: true, enterprise: true },
        { name: "CRM систем", starter: false, pro: true, enterprise: true },
        { name: "QPay төлбөр", starter: false, pro: true, enterprise: true },
        { name: "Тайлан, аналитик", starter: false, pro: true, enterprise: true },
        { name: "24/7 дэмжлэг", starter: false, pro: false, enterprise: true },
        { name: "Хувийн менежер", starter: false, pro: false, enterprise: true },
    ],

    faq: {
        sectionLabel: "FAQ",
        sectionTitle: "Түгээмэл асуултууд",
        items: [
            {
                q: "Суурилуулахад хэр удах вэ?",
                a: "Facebook, Instagram хуудастайгаа холбоход 5 минут л хангалттай. Бүтээгдэхүүн, үйлчилгээний мэдээллээ нэмсний дараа Тусгай борлуулагч agent шууд ажиллаж эхэлнэ.",
            },
            {
                q: "Тусгай борлуулагч agent хэр оновчтой, зөв хариулт өгдөг вэ?",
                a: "Syncly тусгайлан хөгжүүлсэн загвар ашиглаж байгаа тул 95%+ нарийвчлалтай хариулт өгөх болно. Монгол хэлийг бүрэн дэмждэг.",
            },
            {
                q: "Төлбөрийн ямар сонголтууд байдаг вэ?",
                a: "QPay, дансаар шилжүүлэг хийх боломжтой. Сар бүр эсвэл жилээр төлөх сонголттой.",
            },
            {
                q: "Туршилтын хугацаа байдаг уу?",
                a: "Байхгүй.",
            },
            {
                q: "Хэзээ ч цуцалж болох уу?",
                a: "Тийм, ямар ч үед цуцалж болно. Мөн та цуцлах бол тухайн сараа дуустал ашиглах боломжтой.",
            },
        ],
    },

    cta: {
        heading: "Өнөөдөр эхэлцгээе",
        sub: "5 минутад суулгаж, борлуулалтаа автоматжуулаарай.",
        buttonText: "5x өсөлтөө эхлүүлэх",
        linkText: "Үнэ харах →",
    },
};
