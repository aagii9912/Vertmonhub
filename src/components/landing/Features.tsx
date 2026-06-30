'use client';

import { MessageSquare, Building2, TrendingUp, Wallet, BarChart3, Bot } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Reveal, RevealStagger, RevealStaggerItem } from './Reveal';

const FEATURES = [
    {
        icon: MessageSquare,
        title: 'AI хариулагч',
        desc: 'Facebook, Instagram Messenger дээр 24/7 хариулж, лийд цуглуулж, үзлэг товлоно.',
    },
    {
        icon: Building2,
        title: 'Үл хөдлөхийн менежмент',
        desc: 'Орон сууц, блок, давхар, өрөөний мэдээллийг нэг бүртгэлд цэгцтэй удирдана.',
    },
    {
        icon: TrendingUp,
        title: 'Pipeline урьдчилсан тооцоо',
        desc: 'Лийдийн шат бүрийн магадлалаар ирэх сарын борлуулалтыг урьдчилан тооцоолно.',
    },
    {
        icon: Wallet,
        title: 'Санхүү / ERP',
        desc: 'Гэрээний төлбөрийн хуваарь, орлого, хоцрогдсон төлбөрийн хяналт нэг дороос.',
    },
    {
        icon: BarChart3,
        title: 'Тайлан, аналитик',
        desc: 'Менежерийн гүйцэтгэл, win/loss, маркетингийн ROI-г бодит цагаар дүрсэлнэ.',
    },
    {
        icon: Bot,
        title: 'AI туслах',
        desc: 'Дотоод олон-агентт туслах өгөгдөл шинжилж, үйлдэл хийж, асуултад хариулна.',
    },
];

/**
 * Үндсэн боломжуудын grid.
 */
export function Features() {
    return (
        <section id="feature" aria-labelledby="features-title" className="bg-surface-2/40 px-5 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-6xl">
                <Reveal className="mx-auto max-w-2xl text-center">
                    <p className="font-mono text-2xs uppercase tracking-[0.16em] text-brand-strong">Боломжууд</p>
                    <h2 id="features-title" className="heading-display mt-3 text-3xl text-foreground sm:text-4xl">
                        Борлуулалтад хэрэгтэй бүхэн нэг дор
                    </h2>
                    <p className="mt-4 text-base text-muted-foreground">
                        AI борлуулагчаас санхүүгийн тайлан хүртэл — салангид хэрэгслүүдийг нэгтгэв.
                    </p>
                </Reveal>

                <RevealStagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((f) => {
                        const Icon = f.icon;
                        return (
                            <RevealStaggerItem key={f.title}>
                                <Card hover className="h-full p-6">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                                        <Icon className="h-5.5 w-5.5" />
                                    </span>
                                    <h3 className="heading-section mt-5 text-lg text-foreground">{f.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                                </Card>
                            </RevealStaggerItem>
                        );
                    })}
                </RevealStagger>
            </div>
        </section>
    );
}
