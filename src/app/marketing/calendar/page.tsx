'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CalendarDays, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

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
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /><span className="text-gray-500">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <CalendarDays className="w-6 h-6 text-emerald-600" />
                        Контент календарь
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Контент төлөвлөлт</p>
                </div>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="w-4 h-4 mr-2" />Шинэ контент</Button>
            </div>

            <Card>
                <CardContent className="p-4">
                    {/* Month navigation */}
                    <div className="flex items-center justify-between mb-6">
                        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
                        <h2 className="text-lg font-semibold capitalize">{monthName}</h2>
                        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                        {['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'].map(d => (
                            <div key={d} className="bg-gray-50 p-2 text-center text-xs font-medium text-gray-500">{d}</div>
                        ))}
                        {Array.from({ length: firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1 }).map((_, i) => (
                            <div key={`empty-${i}`} className="bg-white p-2 min-h-[80px]" />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const dayItems = getItemsForDay(day);
                            const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
                            return (
                                <div key={day} className={`bg-white p-2 min-h-[80px] ${isToday ? 'ring-2 ring-emerald-500 ring-inset' : ''}`}>
                                    <span className={`text-sm ${isToday ? 'font-bold text-emerald-600' : 'text-gray-700'}`}>{day}</span>
                                    <div className="mt-1 space-y-1">
                                        {dayItems.slice(0, 2).map(item => (
                                            <div key={item.id} className="text-xs px-1 py-0.5 rounded truncate" style={{ backgroundColor: item.color + '20', color: item.color || '#3B82F6' }}>
                                                {item.title}
                                            </div>
                                        ))}
                                        {dayItems.length > 2 && <p className="text-xs text-gray-400">+{dayItems.length - 2}</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {items.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 mt-4">
                            <CalendarDays className="w-12 h-12 text-gray-300 mb-3" />
                            <p className="text-gray-500">Энэ сард контент төлөвлөгдөөгүй байна</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
