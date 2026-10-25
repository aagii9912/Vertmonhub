'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { ubDateStr } from '@/lib/utils/date';
import { weekCoverageDays } from '@/lib/marketing/social-metrics';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { count, useInstagramWeek, WeekMetricCard } from './WeeklySocialPage';

/**
 * Хурлын долоо хоногийн Instagram аккаунтын органик үзүүлэлт (хадгалсан insights, Meta-гийн PT өдөр) ба тухайн
 * долоо хоногт нийтэлсэн media. Хүрсэн хүнийг өдрүүдээр нэмэхгүй — зөвхөн нэг постын (media-ийн) бодит хүрэлт.
 */
export function WeeklyInstagram({ meetingDate }: { meetingDate: string }) {
    const query = useInstagramWeek(meetingDate, true);
    if (query.isPending) return <Skeleton className="h-32 rounded-2xl" />;
    if (query.isError) return <p className="text-xs text-status-danger">Instagram: {query.error.message}</p>;
    const { instagram, error } = query.data;
    // Хуучин сервер (instagram талбаргүй хариу) — картыг харуулахгүй.
    if (instagram === undefined) return null;
    if (!instagram) return <p className="text-xs text-status-danger">Instagram: {error ?? 'үзүүлэлтийг уншиж чадсангүй.'}</p>;
    if (!instagram.account) {
        return <p className="text-xs text-muted-foreground">Instagram холбогдоогүй. <Link href="/marketing/social" className="text-brand-strong hover:underline focus-ring">Маркетинг → Сошиал</Link> хэсэгт холбоно.</p>;
    }
    const known = instagram.metrics.some(metric => metric.value !== null);
    // Дагагчийн тоо дуусаагүй Meta-гийн өдрийнх тул «N/7 өдөр»-т тоолохгүй (`weekCoverageDays`).
    const days = weekCoverageDays(instagram.metrics);
    const top = instagram.posts.slice(0, 3);
    const name = instagram.account.username ? `@${instagram.account.username}` : 'Instagram';
    return (
        <section aria-label="Instagram" className="rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{name} <span className="font-normal text-muted-foreground">· Instagram</span></p>
                <p className="text-xs text-muted-foreground">
                    Meta-гийн өдөр (Номхон далайн цаг){days && days < instagram.rangeDays ? ` · ${days}/${instagram.rangeDays} өдрийн өгөгдөл` : ''}
                    {instagram.syncedTo ? ` · синк ${instagram.syncedTo} хүртэл` : ' · синк хийгдээгүй'}
                </p>
            </div>
            {known ? (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {instagram.metrics.map(metric => <WeekMetricCard key={metric.metric} metric={metric} rangeDays={instagram.rangeDays} />)}
                </div>
            ) : (
                <p className="mt-4 text-sm text-muted-foreground">Энэ долоо хоногийн Instagram үзүүлэлт хадгалагдаагүй байна. Синк 6 цаг тутам; Instagram insights-ийн эрхийг шалгана уу.</p>
            )}
            <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground">Энэ долоо хоногт нийтэлсэн пост: {instagram.posts.length}</p>
                {top.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                        {top.map(post => (
                            <li key={post.id} className="flex items-baseline gap-3 text-sm">
                                <span className="num shrink-0 text-xs text-muted-foreground">{post.publishedAt ? ubDateStr(new Date(post.publishedAt)).slice(5) : '—'}</span>
                                <span className="min-w-0 flex-1 truncate">{post.content?.replace(/\s+/g, ' ').trim() || '(текстгүй пост)'}</span>
                                <span className="num shrink-0 text-xs text-muted-foreground">үзэлт {count(post.views)} · хүрсэн {count(post.reach)} · like {count(post.likes)} · сэтгэгдэл {count(post.comments)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <Link href="/marketing/social" className="mt-4 inline-flex items-center gap-1 text-xs text-brand-strong hover:underline focus-ring print:hidden">Сошиал хуудас<ArrowUpRight className="size-3" /></Link>
        </section>
    );
}
