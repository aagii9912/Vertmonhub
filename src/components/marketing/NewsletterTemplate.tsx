'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { defaultNewsletterDesign, newsletterPreviewHtml, type NewsletterDesign } from '@/lib/marketing/newsletter';

export function NewsletterDesignEditor({ value, onChange, brand }: {
    value: NewsletterDesign | null;
    onChange: (value: NewsletterDesign | null) => void;
    brand: string;
}) {
    return <div className="space-y-4">
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Имэйлийн загвар</legend>
            <div className="flex flex-wrap gap-2">
                {([['newsletter', 'Мэдээллийн товхимол'], ['announcement', 'Зарлал'], ['plain', 'Энгийн текст']] as const).map(([layout, label]) =>
                    <Button key={layout} type="button" size="sm" variant={(value?.layout ?? 'plain') === layout ? 'primary' : 'secondary'} aria-pressed={(value?.layout ?? 'plain') === layout}
                        onClick={() => onChange(layout === 'plain' ? null : { ...(value ?? defaultNewsletterDesign(brand)), layout })}>{label}</Button>)}
            </div>
        </fieldset>
        {value && <div className="grid gap-3 sm:grid-cols-2">
            {([
                ['brand', 'Байгууллага / төслийн нэр', 120, 'text', ''],
                ['preheader', 'Inbox-д харагдах товч тайлбар', 200, 'text', ''],
                ['logoUrl', 'Логоны холбоос', 2000, 'url', 'https://…'],
                ['imageUrl', 'Үндсэн зургийн холбоос', 2000, 'url', 'https://…'],
                ['imageAlt', 'Зургийн тайлбар', 200, 'text', 'Зураг харагдахгүй үед уншигдах тайлбар'],
                ['buttonText', 'Товчны нэр', 80, 'text', 'Дэлгэрэнгүй үзэх'],
                ['buttonUrl', 'Товчны холбоос', 2000, 'url', 'https://…'],
                ['footer', 'Холбоо барих мэдээлэл', 500, 'text', 'Хаяг, утас эсвэл байгууллагын мэдээлэл'],
            ] as const).map(([key, label, maxLength, type, placeholder]) => <label key={key} className="grid gap-1.5 text-sm">
                {label}<Input type={type} maxLength={maxLength} placeholder={placeholder} value={value[key]}
                    onChange={event => onChange({ ...value, [key]: event.target.value })} />
            </label>)}
            <p className="text-xs text-muted-foreground sm:col-span-2">Зураг, лого нь нийтэд нээлттэй https:// холбоостой байна. Товч нэмэх бол нэр, холбоосыг хамтад нь бөглөнө.</p>
        </div>}
    </div>;
}

export function NewsletterPreview({ subject, body, design, title = 'Имэйлийн урьдчилсан харагдац' }: {
    subject: string; body: string; design?: NewsletterDesign | null; title?: string;
}) {
    const [mobile, setMobile] = useState(false);
    const html = newsletterPreviewHtml(subject, body, design);
    return <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Урьдчилсан харагдацын хэмжээ">
            <Button type="button" size="sm" variant={!mobile ? 'primary' : 'secondary'} aria-pressed={!mobile} onClick={() => setMobile(false)}>Компьютер</Button>
            <Button type="button" size="sm" variant={mobile ? 'primary' : 'secondary'} aria-pressed={mobile} onClick={() => setMobile(true)}>Утас</Button>
        </div>
        <iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={html}
            className="mx-auto block h-[600px] w-full rounded-md border border-border bg-surface" style={{ maxWidth: mobile ? 375 : 720 }} />
        <p className="text-xs text-muted-foreground">Имэйл үйлчилгээ бүрт харагдах байдал бага зэрэг ялгаатай байж болно. Энэ харагдац дахь холбоосууд идэвхгүй.</p>
    </div>;
}
