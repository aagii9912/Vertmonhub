import Link from 'next/link';
import { ArrowUpRight, Bot, Building2, Globe, Shield, SlidersHorizontal, Upload, Users } from 'lucide-react';

const sections = [
    { href: '/admin/users', title: 'Хэрэглэгчид', description: 'Ажилтан нэмэх, урих, дүр оноох', icon: Users },
    { href: '/admin/projects', title: 'Төслүүд', description: 'Байгууллагын төслүүдийг үүсгэж, засах', icon: Building2 },
    { href: '/admin/roles', title: 'Дүр ба эрх', description: 'Модуль, бичих болон устгах эрх тохируулах', icon: Shield },
    { href: '/admin/landing', title: 'Нүүр хуудасны контент', description: 'Олон нийтэд харагдах агуулгыг засах', icon: Globe },
    { href: '/dashboard/settings', title: 'Байгууллагын тохиргоо', description: 'Сонгосон байгууллагын мэдээлэл, холболтууд', icon: SlidersHorizontal },
    { href: '/dashboard/ai-settings', title: 'AI ба мэдэгдэл', description: 'Бодитоор ашиглагддаг AI заавар, FAQ, мэдэгдэл', icon: Bot },
    { href: '/admin/import', title: 'Өгөгдөл оруулах', description: 'Төсөл болон CRM өгөгдлийг импортлох', icon: Upload },
];

export default function AdminSettingsPage() {
    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <h1 className="heading-display text-2xl text-foreground">Удирдлагын тохиргоо</h1>
                <p className="mt-1 text-sm text-muted-foreground">Хадгалагддаг тохиргоонууд руу шууд орно.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {sections.map(({ href, title, description, icon: Icon }) => (
                    <Link key={href} href={href} className="group flex min-h-28 items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong"><Icon className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-foreground">{title}</span>
                            <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand-strong" />
                    </Link>
                ))}
            </div>
        </div>
    );
}
