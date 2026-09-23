import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Meta Ads өгөгдөл устгах | Vertmon Hub',
    description: 'Vertmon Hub-ийн Meta Ads холболтын өгөгдлийг устгуулах заавар',
};

export default function DataDeletionPage() {
    return (
        <main className="min-h-screen bg-surface">
            <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
                <Link href="/" className="text-sm font-medium text-status-info hover:underline">
                    ← Нүүр хуудас руу буцах
                </Link>

                <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                    Meta Ads өгөгдөл устгах
                </h1>
                <p className="mt-4 text-lg text-muted-foreground">
                    Энэ заавар нь Vertmon Hub-д Meta зарын дансаа холбосон хэрэглэгч болон тухайн байгууллагын эрх бүхий төлөөлөгчид хамаарна.
                </p>

                <div className="mt-12 space-y-10 text-foreground">
                    <section>
                        <h2 className="text-2xl font-semibold">1. Meta дахь хандалтыг цуцлах</h2>
                        <p className="mt-3 text-muted-foreground">
                            Facebook/Meta-ийн app холболтын тохиргооноос Vertmon Hub-ийн хандалтыг цуцална уу.
                            Ингэснээр бид цаашид шинэ зарын тайлан татах боломжгүй болно. Өмнө Vertmon Hub-д
                            хадгалсан мэдээлэл үүгээр автоматаар устахгүй.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">2. Хадгалсан өгөгдлөө устгуулах хүсэлт илгээх</h2>
                        <p className="mt-3 text-muted-foreground">
                            <a href="mailto:aagii9912@gmail.com" className="font-medium text-status-info hover:underline">aagii9912@gmail.com</a>
                            {' '}хаяг руу “Meta Ads өгөгдөл устгах хүсэлт” гэсэн гарчигтай и-мэйл илгээнэ үү.
                            Байгууллага эсвэл төслийн нэр, зарын дансны ID (мэдэж байвал), холбоо барих и-мэйл,
                            устгуулах өгөгдлийн хүрээг бичнэ үү. Нууц үг болон access token-оо и-мэйлээр бүү илгээгээрэй.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">3. Хүсэлтийг шалгаж шийдвэрлэх</h2>
                        <p className="mt-3 text-muted-foreground">
                            Бид хүсэлт гаргагч тухайн байгууллага, зарын дансыг төлөөлөх эрхтэй эсэхийг шалгана.
                            Баталгаажсан хүсэлтийн дагуу Vertmon Hub-д хадгалсан Meta Ads холболтын шифрлэсэн эрх,
                            сонгосон зарын дансны холбоос болон импортолсон зарцуулалтын тайлангийн холбогдох
                            өгөгдлийг устгах хүсэлтийг шийдвэрлэнэ.
                        </p>
                    </section>
                </div>

                <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
                    Бид Meta Ads мэдээллийг хэрхэн ашигладаг талаар{' '}
                    <Link href="/privacy" className="font-medium text-status-info hover:underline">Нууцлалын бодлогоос</Link>
                    {' '}үзнэ үү.
                </p>
            </div>
        </main>
    );
}
