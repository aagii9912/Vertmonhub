'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { invalidateDailyMeetingQueries } from '@/hooks/useDailyReport';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils/date';
import { ANONYMOUS_LEAD_LABEL } from '@/lib/leads/labels';
import { MEETING_TYPE_META, MEETING_TYPES, type MeetingType } from '@/lib/viewings/labels';
import { REFERRAL_FIELD_LABEL, REFERRAL_LIST_FAILED, isActiveReferral, referralRequired, referralSubmitError } from '@/lib/sales/referral-sources';
import { useReferralSources } from '@/hooks/useReferralSources';
import { formalManagerName, reportDateLabel, type DailyReportManager } from '@/lib/dashboard/daily-report';
import {
    DAILY_MEETING_DEFAULT_TIME, dailyMeetingPhone, type DailyMeetingRequestBody, type DailyMeetingResponse,
} from '@/lib/dashboard/daily-report-meetings';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

const segment = (active: boolean) => cn(
    'h-8 rounded-md border px-2.5 text-[13px]',
    active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-fg-2 hover:border-border-strong hover:bg-surface-2',
);

/**
 * «Уулзалт нэмэх» — ээлжийн менежер хамт олныхоо БОЛСОН уулзалтыг тухайн менежерийн нэр дээр бүртгэнэ
 * (POST /api/dashboard/daily-report/meetings `record`). Утсаар төслийн лидийг сервер хайна: тухайн
 * менежерийн лид бол түүнд холбоно, өөр менежерийн эсвэл хариуцагчгүй лид бол бүртгэхгүй (давхар лидгүй).
 */
export function DailyMeetingDialog({ open, onOpenChange, date, today, managers, defaultManager }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    date: string;
    today: string;
    /** Бүртгэж болох (идэвхтэй, төсөлд бүртгэлтэй) менежерүүд. */
    managers: readonly DailyReportManager[];
    defaultManager: string | null;
}) {
    const queryClient = useQueryClient();
    const [manager, setManager] = useState(() => (defaultManager && managers.some(item => item.name === defaultManager) ? defaultManager : managers[0]?.name ?? ''));
    const [type, setType] = useState<MeetingType>('new_customer');
    const [time, setTime] = useState(() => (date === today ? formatTime(new Date()) : DAILY_MEETING_DEFAULT_TIME));
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [anonymous, setAnonymous] = useState(false);
    const [notes, setNotes] = useState('');
    const [feedback, setFeedback] = useState('');
    const [interest, setInterest] = useState<number | null>(null);
    const [referral, setReferral] = useState('');
    const [saving, setSaving] = useState(false);
    // «Сэжим (хаанаас ирсэн)»: жагсаалтгүй төсөлд бүртгэхийг хаахгүй. Ачаалж байгаа / уншиж чадаагүй үед шинэ
    // харилцагчийн уулзалтыг илгээхгүй (сервер жагсаалттай төсөлд шаардана) — алдааг энд харуулж дахин оролдуулна.
    const referralQuery = useReferralSources({ inlineError: true, enabled: open });
    const referralOptions = (referralQuery.data?.sources ?? []).filter(isActiveReferral);
    const referralLoading = referralQuery.isLoading;
    const referralFailed = referralQuery.isError && !referralQuery.data;
    const needsReferral = referralRequired(type, referralOptions.length);

    async function submit() {
        if (!manager) { toast.error('Менежерээ сонгоно уу'); return; }
        if (!dailyMeetingPhone(phone)) { toast.error('Утасны дугаараа бүтнээр оруулна уу'); return; }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { toast.error('Уулзалтын цагаа оруулна уу'); return; }
        if (date === today && time > formatTime(new Date())) { toast.error('Ирээдүйн цагийн уулзалтыг бүртгэхгүй. Цагаа шалгана уу.'); return; }
        const referralError = referralSubmitError(type, {
            loading: referralLoading, failed: referralFailed, activeCount: referralOptions.length, selected: referralOptions.some(item => item.id === referral),
        });
        if (referralError) { toast.error(referralError); return; }
        const body: DailyMeetingRequestBody = {
            action: 'record', date, manager, meeting_type: type, time,
            customer_phone: phone.trim(),
            customer_name: anonymous ? null : name.trim() || null,
            anonymous,
            notes: notes.trim() || null,
            feedback: feedback.trim() || null,
            interest_level: interest,
            // Сонгоогүй бол түлхүүрийг илгээхгүй (хуучин серверийн strict схем мэдэхгүй түлхүүрийг татгалздаг).
            ...(referralOptions.some(item => item.id === referral) ? { referral_source_id: referral } : {}),
        };
        setSaving(true);
        try {
            const result = await dashboardMutate<DailyMeetingResponse>('/api/dashboard/daily-report/meetings', 'POST', body);
            await invalidateDailyMeetingQueries(queryClient);
            const title = managers.find(item => item.name === manager)?.title ?? formalManagerName(manager);
            toast.success(`Уулзалт ${title}-ийн нэр дээр бүртгэгдлээ${result.lead_created ? ' · шинэ лид үүсгэв' : ''}`);
            onOpenChange(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Уулзалтыг хадгалж чадсангүй. Дахин оролдоно уу.');
            // Жагсаалт хуучирсан байж болно (админ дөнгөж нэмсэн / архивласан): маягтыг хаалгүй шинэчилнэ.
            void referralQuery.refetch();
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next); }}>
            <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Уулзалт нэмэх</DialogTitle>
                    <DialogDescription>
                        <span className="num">{reportDateLabel(date)}</span>-нд болсон уулзалтыг сонгосон менежерийн нэр дээр бүртгэнэ. Утсаар төслийн лидийг хайж,
                        тухайн менежерийн лид байвал түүнд холбоно; өөр менежерийн лид бол бүртгэхгүй.
                    </DialogDescription>
                </DialogHeader>

                <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
                        <FormField label="Менежер" htmlFor="daily-meeting-manager" required>
                            <Select value={manager || undefined} onValueChange={setManager}>
                                <SelectTrigger id="daily-meeting-manager"><SelectValue placeholder="Менежер сонгох" /></SelectTrigger>
                                <SelectContent>
                                    {managers.map(item => <SelectItem key={item.name} value={item.name}>{item.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </FormField>
                        <FormField label="Цаг" htmlFor="daily-meeting-time" required>
                            <Input id="daily-meeting-time" type="time" step={60} className="num" value={time} onChange={event => setTime(event.target.value)} />
                        </FormField>
                    </div>

                    <FormField label="Төрөл">
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Уулзалтын төрөл">
                            {MEETING_TYPES.map(value => (
                                <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)} className={segment(type === value)}>
                                    {MEETING_TYPE_META[value].short}
                                </button>
                            ))}
                        </div>
                    </FormField>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="Утас" htmlFor="daily-meeting-phone" required hint="Утсаар лидийг хайна">
                            <Input id="daily-meeting-phone" aria-describedby="daily-meeting-phone-hint" inputMode="tel" className="num" placeholder="9909 1122" value={phone} onChange={event => setPhone(event.target.value)} />
                        </FormField>
                        <FormField label="Нэр" htmlFor="daily-meeting-name" hint="Шинэ харилцагчид">
                            <Input id="daily-meeting-name" aria-describedby="daily-meeting-name-hint" value={name} disabled={anonymous} placeholder={anonymous ? ANONYMOUS_LEAD_LABEL : 'Б. Болд'} maxLength={200}
                                onChange={event => setName(event.target.value)} />
                        </FormField>
                    </div>
                    <label htmlFor="daily-meeting-anonymous" className="-mt-2 flex w-fit cursor-pointer items-center gap-2 text-[13px] text-fg-2 select-none">
                        <Checkbox id="daily-meeting-anonymous" checked={anonymous} onCheckedChange={checked => { setAnonymous(checked === true); if (checked === true) setName(''); }} />
                        Нэр тодорхойгүй — нэргүй бүртгэх
                    </label>

                    {referralFailed ? (
                        <FormField label={REFERRAL_FIELD_LABEL}>
                            <p role="alert" className="text-xs text-status-danger">
                                {REFERRAL_LIST_FAILED}{' '}
                                <button type="button" className="underline" disabled={referralQuery.isFetching} onClick={() => void referralQuery.refetch()}>Дахин оролдох</button>
                            </p>
                        </FormField>
                    ) : (referralLoading || referralOptions.length > 0) && (
                        <FormField label={REFERRAL_FIELD_LABEL} htmlFor="daily-meeting-referral" required={needsReferral}>
                            <Select value={referral || undefined} onValueChange={setReferral} disabled={referralLoading}>
                                <SelectTrigger id="daily-meeting-referral" aria-label={REFERRAL_FIELD_LABEL}><SelectValue placeholder={referralLoading ? 'Ачаалж байна…' : 'Сонгох'} /></SelectTrigger>
                                <SelectContent>
                                    {referralOptions.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </FormField>
                    )}

                    <FormField label="Тэмдэглэл" htmlFor="daily-meeting-notes">
                        <Textarea id="daily-meeting-notes" rows={2} maxLength={4000} placeholder="Сонирхсон байр, нөхцөл…" value={notes} onChange={event => setNotes(event.target.value)} />
                    </FormField>
                    <FormField label="Харилцагчийн санал" htmlFor="daily-meeting-feedback">
                        <Textarea id="daily-meeting-feedback" rows={2} maxLength={4000} placeholder="Юу таалагдсан, юу болохгүй…" value={feedback} onChange={event => setFeedback(event.target.value)} />
                    </FormField>
                    <FormField label="Сонирхол">
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Сонирхол (1–5)">
                            {[1, 2, 3, 4, 5].map(level => (
                                <button key={level} type="button" aria-pressed={interest === level} aria-label={`Сонирхол ${level}/5`}
                                    onClick={() => setInterest(current => (current === level ? null : level))} className={cn(segment(interest === level), 'num w-9 px-0')}>
                                    {level}
                                </button>
                            ))}
                        </div>
                    </FormField>

                    <DialogFooter>
                        <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Болих</Button>
                        <Button type="submit" disabled={saving || !managers.length}>{saving ? 'Бүртгэж байна…' : 'Бүртгэх'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
