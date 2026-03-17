'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Share2, Heart, MessageCircle, Eye, Plus, Facebook, Instagram, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface SocialPost {
    id: string;
    platform: string;
    content: string;
    status: string;
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    published_at: string;
}

export default function SocialPage() {
    const { shop } = useAuth();
    const [posts, setPosts] = useState<SocialPost[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('social_posts')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                setPosts(data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id]);

    const totalLikes = posts.reduce((s, p) => s + (p.likes || 0), 0);
    const totalReach = posts.reduce((s, p) => s + (p.reach || 0), 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500">Татаж байна...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Share2 className="w-6 h-6 text-emerald-600" />
                        Сошиал медиа
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Нийтлэлүүд болон оролцоо</p>
                </div>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Шинэ нийтлэл
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Нийт нийтлэл</p><p className="text-2xl font-bold mt-1">{posts.length}</p></div><div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center"><Share2 className="w-6 h-6 text-blue-600" /></div></div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Нийт like</p><p className="text-2xl font-bold mt-1">{totalLikes.toLocaleString()}</p></div><div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center"><Heart className="w-6 h-6 text-pink-600" /></div></div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Нийт хүрэлт</p><p className="text-2xl font-bold mt-1">{totalReach.toLocaleString()}</p></div><div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center"><Eye className="w-6 h-6 text-emerald-600" /></div></div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    {posts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Share2 className="w-16 h-16 text-gray-300 mb-4" />
                            <h2 className="text-xl font-semibold text-gray-700 mb-2">Мэдээлэл байхгүй</h2>
                            <p className="text-gray-500">Сошиал медиа нийтлэлүүд энд харагдана.</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {posts.map(post => (
                                <div key={post.id} className="p-4 hover:bg-gray-50">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                {post.platform === 'facebook' ? <Facebook className="w-4 h-4 text-blue-600" /> : <Instagram className="w-4 h-4 text-pink-600" />}
                                                <span className="text-xs text-gray-500 capitalize">{post.platform}</span>
                                                <span className={`px-2 py-0.5 text-xs rounded-full ${post.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {post.status === 'published' ? 'Нийтлэгдсэн' : post.status === 'scheduled' ? 'Төлөвлөсөн' : 'Ноорог'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-900 line-clamp-2">{post.content}</p>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-gray-500 ml-4">
                                            <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likes}</span>
                                            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.comments}</span>
                                            <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{post.shares}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
