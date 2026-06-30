'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CalendarDays, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/Dialog';
import { FormField, FieldGroup } from '@/components/ui/FormField';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';

interface CalendarItem {
    id: string;
    title: string;
    type: string;
    platform: string;
    scheduled_date: string;
    status: string;
    color: string;
}

const typeLabels: Record<string, string> = {
    post: 'Пост',
    story: 'Story',
    reel: 'Reel',
    blog: 'Блог',
    email: 'Имэйл',
    ad: 'Зар',
    event: 'Эвент',
};

export default function CalendarPage() {
    const { shop } = useAuth();
    const [items, setItems] = useState<CalendarItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newItem, setNewItem] = useState({ title: '', type: 'post', platform: 'facebook', scheduled_date: new Date().toISOString().split('T')[0], color: '#3B82F6' });

    const handleCreate = async () => {
        if (!shop?.id || !newItem.title.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('content_calendar').insert([{
                shop_id: shop.id, title: newItem.title.trim(), type: newItem.type,
                platform: newItem.platform, scheduled_date: newItem.scheduled_date,
                status: 'planned', color: newItem.color,
            }]).select().single();
            if (error) throw error;
            setItems(prev => [...prev, data].sort((a: CalendarItem, b: CalendarItem) => a.scheduled_date.localeCompare(b.scheduled_date)));
            setShowCreateModal(false);
            setNewItem({ title: '', type: 'post', platform: 'facebook', scheduled_date: new Date().toISOString().split('T')[0], color: '#3B82F6' });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split('T')[0];

                const { data, error } = await supabase
                    .from('content_calendar')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .gte('scheduled_date', startOfMonth)
                    .lte('scheduled_date', endOfMonth)
                    .order('scheduled_date', { ascending: true });
                if (error) throw error;
                setItems(data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id, currentDate]);

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const monthName = currentDate.toLocaleDateString('mn-MN', { year: 'numeric', month: 'long' });

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    const getItemsForDay = (day: number) => {
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return items.filter(item => item.scheduled_date === dateStr);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <Spinner />
                    <span className="text-muted-foreground">Татаж байна...</span>
                </div>
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Контент календарь"
                subtitle="Контент төлөвлөлт"
                primaryAction={
                    <Button onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4" />
                        Шинэ контент
                    </Button>
                }
            />

            <Card>
                <CardContent className="p-4">
                    {/* Month navigation */}
                    <div className="flex items-center justify-between mb-6">
                        <Button variant="ghost" size="iconSm" aria-label="Өмнөх сар" onClick={prevMonth}>
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <h2 className="heading-section text-lg text-foreground capitalize">{monthName}</h2>
                        <Button variant="ghost" size="iconSm" aria-label="Дараах сар" onClick={nextMonth}>
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                        {['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'].map(d => (
                            <div key={d} className="bg-surface-2 p-2 text-center text-2xs font-semibold uppercase tracking-wide text-muted-2">{d}</div>
                        ))}
                        {Array.from({ length: firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1 }).map((_, i) => (
                            <div key={`empty-${i}`} className="bg-surface p-2 min-h-[80px]" />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const dayItems = getItemsForDay(day);
                            const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
                            return (
                                <div key={day} className={cn('bg-surface p-2 min-h-[80px]', isToday && 'ring-2 ring-brand ring-inset')}>
                                    <span className={cn('text-sm tabular-nums', isToday ? 'font-bold text-brand-strong' : 'text-foreground')}>{day}</span>
                                    <div className="mt-1 space-y-1">
                                        {dayItems.slice(0, 2).map(item => (
                                            <div key={item.id} className="text-xs px-1 py-0.5 rounded truncate" style={{ backgroundColor: item.color + '20', color: item.color || '#3B82F6' }}>
                                                {item.title}
                                            </div>
                                        ))}
                                        {dayItems.length > 2 && <p className="text-xs text-muted-foreground">+{dayItems.length - 2}</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {items.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 mt-4">
                            <CalendarDays className="w-12 h-12 text-muted-foreground/60 mb-3" />
                            <p className="text-muted-foreground">Энэ сард контент төлөвлөгдөөгүй байна</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Modal */}
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent showCloseButton={false} className="rounded-xl sm:max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="heading-section text-lg text-foreground">Шинэ контент</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <FormField label="Гарчиг" htmlFor="calendar-title" required>
                            <Input id="calendar-title" value={newItem.title} onChange={e => setNewItem(p => ({ ...p, title: e.target.value }))} placeholder="Контентын гарчиг" />
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Төрөл" htmlFor="calendar-type">
                                <Select value={newItem.type} onValueChange={v => setNewItem(p => ({ ...p, type: v }))}>
                                    <SelectTrigger id="calendar-type">
                                        <SelectValue placeholder="— Сонгох —" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="post">Пост</SelectItem>
                                        <SelectItem value="story">Story</SelectItem>
                                        <SelectItem value="reel">Reel</SelectItem>
                                        <SelectItem value="blog">Блог</SelectItem>
                                        <SelectItem value="ad">Зар</SelectItem>
                                        <SelectItem value="event">Эвент</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
                            <FormField label="Платформ" htmlFor="calendar-platform">
                                <Select value={newItem.platform} onValueChange={v => setNewItem(p => ({ ...p, platform: v }))}>
                                    <SelectTrigger id="calendar-platform">
                                        <SelectValue placeholder="— Сонгох —" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="facebook">Facebook</SelectItem>
                                        <SelectItem value="instagram">Instagram</SelectItem>
                                        <SelectItem value="tiktok">TikTok</SelectItem>
                                        <SelectItem value="web">Вэб</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Огноо" htmlFor="calendar-date">
                                <Input id="calendar-date" type="date" value={newItem.scheduled_date} onChange={e => setNewItem(p => ({ ...p, scheduled_date: e.target.value }))} />
                            </FormField>
                            <FormField label="Өнгө" htmlFor="calendar-color">
                                <input id="calendar-color" type="color" value={newItem.color} onChange={e => setNewItem(p => ({ ...p, color: e.target.value }))} className="w-full h-9 rounded-md border border-border-strong cursor-pointer" />
                            </FormField>
                        </div>
                    </FieldGroup>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Болих</Button>
                        <Button onClick={handleCreate} disabled={!newItem.title.trim() || creating} isLoading={creating}>
                            {!creating && <Plus className="w-4 h-4" />}
                            Үүсгэх
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
