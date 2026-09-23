import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy | Vertmon Hub',
    description: 'Vertmon Hub үйлчилгээний нууцлалын бодлого',
};

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-surface dark:bg-surface">
            <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
                {/* Header */}
                <div className="mb-12">
                    <Link
                        href="/"
                        className="inline-flex items-center text-sm font-medium text-status-info hover:text-status-info dark:text-status-info"
                    >
                        ← Нүүр хуудас руу буцах
                    </Link>
                    <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground  sm:text-5xl">
                        Нууцлалын бодлого
                    </h1>
                    <p className="mt-4 text-lg text-muted-foreground dark:text-muted-foreground/70">
                        Сүүлд шинэчилсэн: 2026 оны 9-р сарын 23
                    </p>
                </div>

                {/* Content */}
                <div className="prose prose-lg dark:prose-invert max-w-none">
                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">1. Танилцуулга</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Vertmon Hub ("бид", "манай") нь таны хувийн мэдээллийн нууцлалыг хамгаалахыг эрхэмлэдэг.
                            Энэхүү Нууцлалын бодлого нь манай үйлчилгээг ашиглах явцад бидний цуглуулж, ашиглаж,
                            хадгалдаг мэдээллийн талаар тайлбарладаг.
                        </p>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">2. Цуглуулдаг мэдээлэл</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Бид дараах төрлийн мэдээллийг цуглуулж болно:
                        </p>
                        <ul className="list-disc pl-6 text-foreground dark:text-muted-foreground/60 space-y-2 mb-4">
                            <li><strong>Харилцагчийн мэдээлэл:</strong> Нэр, утасны дугаар, и-мэйл хаяг, байгууллагын нэр</li>
                            <li><strong>Мессежийн мэдээлэл:</strong> Facebook Messenger болон Instagram-аар илгээсэн мессежүүд, чат түүх</li>
                            <li><strong>Бизнесийн мэдээлэл:</strong> Сонирхсон үл хөдлөх хөрөнгө, борлуулалт болон маркетингийн тайлан</li>
                            <li><strong>Meta Ads мэдээлэл:</strong> Холбосон зарын дансны ID, кампанит ажлын ID, нэр, тохиргоо, өдрийн зарцуулалт, үзэлт, даралт, хөрвүүлэлт зэрэг гүйцэтгэлийн үзүүлэлт, валют, цагийн бүс, шифрлэсэн холболтын эрх болон түүний хугацаа</li>
                            <li><strong>Техникийн мэдээлэл:</strong> IP хаяг, төхөөрөмжийн төрөл, browser мэдээлэл</li>
                        </ul>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">3. Мэдээллийн ашиглалт</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Цуглуулсан мэдээллээ дараах зорилгоор ашигладаг:
                        </p>
                        <ul className="list-disc pl-6 text-foreground dark:text-muted-foreground/60 space-y-2 mb-4">
                            <li>AI туслахаар автомат хариулт үүсгэх</li>
                            <li>Харилцагчийн үйлчилгээ үзүүлэх</li>
                            <li>Үл хөдлөх хөрөнгийн сонирхогч, борлуулалтын ажлыг удирдах</li>
                            <li>Бизнесийн статистик, тайлан гаргах</li>
                            <li>Үйлчилгээг сайжруулах, хөгжүүлэх</li>
                            <li>Холбоо барих, мэдэгдэл илгээх</li>
                        </ul>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">4. Meta холболт</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Манай AI туслах Facebook Messenger болон Instagram мессежид ажилладаг. Мессеж солилцох үед:
                        </p>
                        <ul className="list-disc pl-6 text-foreground dark:text-muted-foreground/60 space-y-2 mb-4">
                            <li>Таны мессежүүд манай AI системд боловсруулагдана</li>
                            <li>Чат түүх манай датабаазад хадгалагдана</li>
                            <li>Facebook болон Instagram-ийн нууцлалын бодлого мөн хамаарна</li>
                            <li>Та Meta дахь тохиргоогоор мессеж солилцохыг зогсоож болно</li>
                        </ul>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Төслийн эрх бүхий хэрэглэгч Meta Ads-ийг холбовол бид зөвхөн зарын тайлан унших <code>ads_read</code> эрх хүснэ.
                            Холболтын эрхийг шифрлэн хадгалж, сонгосон зарын дансны кампанит ажил болон өдрийн зарцуулалтыг
                            маркетингийн тайланд татна. Энэ холболтоор зар үүсгэх, засах эрх хүсэхгүй.
                        </p>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">5. Мэдээллийн хадгалалт</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Бид дараах технологиуд ашиглан мэдээллээ аюулгүй хадгалдаг:
                        </p>
                        <ul className="list-disc pl-6 text-foreground dark:text-muted-foreground/60 space-y-2 mb-4">
                            <li><strong>Supabase:</strong> Өгөгдлийн сан; Meta Ads холболтын эрхийг хадгалахаас өмнө шифрлэдэг</li>
                            <li><strong>Vercel:</strong> Hosting үйлчилгээ, SSL сертификаттай</li>
                            <li><strong>AI туслах:</strong> Хариулт үүсгэх боловсруулалт</li>
                        </ul>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">6. Гуравдагч этгээд</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Бид дараах гуравдагч үйлчилгээ ашигладаг:
                        </p>
                        <ul className="list-disc pl-6 text-foreground dark:text-muted-foreground/60 space-y-2 mb-4">
                            <li><strong>Facebook/Meta:</strong> Messenger, Instagram болон зарын тайлангийн API</li>
                            <li><strong>AI систем:</strong> Хариулт үүсгэх боловсруулалт</li>
                            <li><strong>Supabase:</strong> Database хостинг</li>
                            <li><strong>Vercel:</strong> Веб хостинг</li>
                        </ul>
                        <p className="text-foreground dark:text-muted-foreground/60 mt-4">
                            Эдгээр үйлчилгээ бүр өөрийн Privacy Policy-тай бөгөөд бид тэдэнтэй мэдээлэл хуваалцахдаа
                            зөвхөн шаардлагатай хэмжээгээр хязгаарладаг.
                        </p>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">7. Таны эрх</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Та дараах эрхтэй:
                        </p>
                        <ul className="list-disc pl-6 text-foreground dark:text-muted-foreground/60 space-y-2 mb-4">
                            <li>Өөрийн мэдээллийг харах, засах</li>
                            <li>Өөрийн өгөгдлийг устгуулах</li>
                            <li>Мэдээлэл цуглуулахыг зогсоох</li>
                            <li>Мэдээллийн хуулбар авах</li>
                            <li>Үйлчилгээнээс гарах</li>
                        </ul>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Meta Ads-д олгосон хандалтыг Facebook-ийн холболтын тохиргооноос цуцалж болно.
                            Ингэвэл цаашид шинэ зарын тайлан татах боломжгүй болно. Өмнө хадгалсан холболтын эрх
                            болон импортолсон тайлан автоматаар устахгүй. Устгуулах хүсэлтийн алхмуудыг{' '}
                            <Link href="/data-deletion" className="text-status-info hover:underline">өгөгдөл устгах заавраас</Link>
                            {' '}үзнэ үү.
                        </p>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">8. Хүүхдийн мэдээлэл</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Манай үйлчилгээ нь 18 насанд хүрээгүй хүүхдэд зориулагдаагүй. Бид зориуд 18 насанд
                            хүрээгүй хүүхдээс мэдээлэл цуглуулдаггүй.
                        </p>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">9. Бодлогын өөрчлөлт</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Бид энэхүү Нууцлалын бодлогоо цаг үетэй хөгжүүлж, шинэчилж болно. Томоохон өөрчлөлт
                            гарсан тохиолдолд таныг мэдэгдэх болно.
                        </p>
                    </section>

                    <section className="mb-12">
                        <h2 className="text-2xl font-bold text-foreground  mb-4">10. Холбоо барих</h2>
                        <p className="text-foreground dark:text-muted-foreground/60 mb-4">
                            Нууцлалын бодлоготой холбоотой асуулт байвал:
                        </p>
                        <ul className="list-none text-foreground dark:text-muted-foreground/60 space-y-2">
                            <li><strong>Вэб:</strong> <a href="https://www.vertmon.mn" className="text-status-info hover:text-status-info">www.vertmon.mn</a></li>
                            <li><strong>И-мэйл:</strong> <a href="mailto:aagii9912@gmail.com" className="text-status-info hover:text-status-info">aagii9912@gmail.com</a></li>
                        </ul>
                    </section>

                    <div className="mt-12 rounded-lg bg-surface-2/40 dark:bg-foreground p-6 border border-border dark:border-border">
                        <p className="text-sm text-muted-foreground dark:text-muted-foreground/70">
                            Манай үйлчилгээг ашигласнаар та энэхүү Нууцлалын бодлогыг хүлээн зөвшөөрч байна.
                        </p>
                    </div>
                </div>

                {/* Back to Home */}
                <div className="mt-12 text-center">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-white hover:bg-fg-2 transition-colors"
                    >
                        Нүүр хуудас руу буцах
                    </Link>
                </div>
            </div>
        </div >
    );
}
