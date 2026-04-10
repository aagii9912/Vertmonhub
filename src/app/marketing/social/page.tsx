'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Share2, Heart, MessageCircle, Eye, Plus, Facebook, Instagram,
    TrendingUp, Users, ExternalLink, RefreshCw, Image as ImageIcon,
    Send, ThumbsUp, BarChart3, Link2, AlertCircle, CheckCircle2,
    Loader2, X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ======= Types =======

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

interface FacebookPageData {
    id: string;
    name: string;
    category?: string;
    fan_count?: number;
    followers_count?: number;
    picture?: { data: { url: string } };
    cover?: { source: string };
    about?: string;
    website?: string;
    link?: string;
    stored_name?: string;
}

interface FacebookPostData {
    id: string;
    message: string;
    image: string | null;
    permalink: string | null;
    created_time: string;
    likes: number;
    comments: number;
    shares: number;
}

interface InsightsData {
    [key: string]: {
        title: string;
        description: string;
        period: string;
        value: number;
        values: Array<{ value: number; end_time: string }>;
    };
}

type TabType = 'all' | 'facebook' | 'instagram';

// ======= Component =======

export default function SocialPage() {
    const { shop } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('facebook');

    // Internal posts
    const [posts, setPosts] = useState<SocialPost[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);

    // Facebook state
    const [fbConnected, setFbConnected] = useState(false);
    const [fbPage, setFbPage] = useState<FacebookPageData | null>(null);
    const [fbPosts, setFbPosts] = useState<FacebookPostData[]>([]);
    const [fbInsights, setFbInsights] = useState<InsightsData | null>(null);
    const [fbLoading, setFbLoading] = useState(true);
    const [fbError, setFbError] = useState<string | null>(null);
    const [tokenExpired, setTokenExpired] = useState(false);

    // Publish modal
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [publishMessage, setPublishMessage] = useState('');
    const [publishImageUrl, setPublishImageUrl] = useState('');
    const [publishing, setPublishing] = useState(false);
    const [publishResult, setPublishResult] = useState<string | null>(null);

    // Instagram state
    const [igConnected, setIgConnected] = useState(false);
    const [igAccount, setIgAccount] = useState<any>(null);
    const [igPosts, setIgPosts] = useState<any[]>([]);
    const [igLoading, setIgLoading] = useState(true);
    const [igError, setIgError] = useState<string | null>(null);

    // ======= Load internal posts =======
    useEffect(() => {
        if (!shop?.id) return;
        const fetchPosts = async () => {
            setLoadingPosts(true);
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
                setLoadingPosts(false);
            }
        };
        fetchPosts();
    }, [shop?.id]);

    // ======= Load Facebook data =======
    const fetchFacebookData = useCallback(async () => {
        setFbLoading(true);
        setFbError(null);
        try {
            // Page info
            const pageRes = await fetch(`/api/marketing/facebook${shop?.id ? `?shop_id=${shop.id}` : ''}`);
            const pageData = await pageRes.json();

            if (pageData.connected) {
                setFbConnected(true);
                setFbPage(pageData.page);
                setTokenExpired(false);

                // Posts
                const postsRes = await fetch(`/api/marketing/facebook/posts${shop?.id ? `?shop_id=${shop.id}` : ''}`);
                const postsData = await postsRes.json();
                setFbPosts(postsData.posts || []);

                // Insights (may fail due to permissions)
                try {
                    const insightsRes = await fetch(`/api/marketing/facebook/insights${shop?.id ? `?shop_id=${shop.id}` : ''}`);
                    const insightsData = await insightsRes.json();
                    if (insightsData.insights) {
                        setFbInsights(insightsData.insights);
                    }
                } catch {
                    // Insights permission байхгүй бол skip
                }
            } else {
                setFbConnected(false);
                setTokenExpired(pageData.token_expired || false);
                if (pageData.error) setFbError(pageData.error);
            }
        } catch (error: any) {
            console.error('Facebook data error:', error);
            setFbError('Facebook мэдээлэл ачааллахад алдаа гарлаа');
        } finally {
            setFbLoading(false);
        }
    }, [shop?.id]);

    useEffect(() => {
        fetchFacebookData();
    }, [fetchFacebookData]);

    // ======= Load Instagram data =======
    const fetchInstagramData = useCallback(async () => {
        setIgLoading(true);
        setIgError(null);
        try {
            const res = await fetch(`/api/marketing/instagram${shop?.id ? `?shop_id=${shop.id}` : ''}`);
            const data = await res.json();
            if (data.connected) {
                setIgConnected(true);
                setIgAccount(data.account);
                setIgPosts(data.posts || []);
            } else {
                setIgConnected(false);
                if (data.error) setIgError(data.error);
            }
        } catch (error: any) {
            console.error('Instagram data error:', error);
            setIgError('Instagram мэдээлэл ачааллахад алдаа гарлаа');
        } finally {
            setIgLoading(false);
        }
    }, [shop?.id]);

    useEffect(() => {
        fetchInstagramData();
    }, [fetchInstagramData]);

    // ======= Publish post =======
    const handlePublish = async () => {
        if (!publishMessage.trim()) return;
        setPublishing(true);
        setPublishResult(null);
        try {
            const res = await fetch('/api/marketing/facebook/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: publishMessage,
                    imageUrl: publishImageUrl || undefined,
                    shop_id: shop?.id,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setPublishResult('success');
                setPublishMessage('');
                setPublishImageUrl('');
                // Refresh posts
                setTimeout(() => {
                    fetchFacebookData();
                    setShowPublishModal(false);
                    setPublishResult(null);
                }, 2000);
            } else {
                setPublishResult(data.error || 'Нийтлэхэд алдаа гарлаа');
            }
        } catch (error) {
            setPublishResult('Нийтлэхэд алдаа гарлаа');
        } finally {
            setPublishing(false);
        }
    };

    // ======= Helpers =======
    const formatNumber = (v: number) => {
        if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
        if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
        return String(v);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('mn-MN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const totalLikes = posts.reduce((s, p) => s + (p.likes || 0), 0);
    const totalReach = posts.reduce((s, p) => s + (p.reach || 0), 0);

    // ======= Tab content =======

    const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
        { id: 'facebook', label: 'Facebook', icon: Facebook },
        { id: 'instagram', label: 'Instagram', icon: Instagram },
        { id: 'all', label: 'Бүх нийтлэл', icon: Share2 },
    ];

    // ======= Render =======

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Share2 className="w-6 h-6 text-emerald-600" />
                        Сошиал медиа
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Facebook & Instagram нийтлэлүүд</p>
                </div>
                {fbConnected && activeTab === 'facebook' && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => fetchFacebookData()}
                            className="text-gray-600"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Шинэчлэх
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => setShowPublishModal(true)}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Шинэ нийтлэл
                        </Button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                                activeTab === tab.id
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Facebook Tab */}
            {activeTab === 'facebook' && (
                <FacebookTabContent
                    loading={fbLoading}
                    connected={fbConnected}
                    page={fbPage}
                    posts={fbPosts}
                    insights={fbInsights}
                    error={fbError}
                    tokenExpired={tokenExpired}
                    formatNumber={formatNumber}
                    formatDate={formatDate}
                    onConnect={() => window.location.href = '/api/auth/facebook'}
                    onRefresh={fetchFacebookData}
                />
            )}

            {/* Instagram Tab */}
            {activeTab === 'instagram' && (
                <InstagramTabContent
                    loading={igLoading}
                    connected={igConnected}
                    account={igAccount}
                    posts={igPosts}
                    error={igError}
                    formatNumber={formatNumber}
                    formatDate={formatDate}
                    onConnect={() => window.location.href = '/api/auth/instagram'}
                />
            )}

            {/* All Posts Tab */}
            {activeTab === 'all' && (
                <AllPostsContent
                    posts={posts}
                    loading={loadingPosts}
                    totalLikes={totalLikes}
                    totalReach={totalReach}
                    formatNumber={formatNumber}
                    formatDate={formatDate}
                />
            )}

            {/* Publish Modal */}
            {showPublishModal && (
                <PublishModal
                    message={publishMessage}
                    setMessage={setPublishMessage}
                    imageUrl={publishImageUrl}
                    setImageUrl={setPublishImageUrl}
                    publishing={publishing}
                    publishResult={publishResult}
                    onPublish={handlePublish}
                    onClose={() => {
                        setShowPublishModal(false);
                        setPublishResult(null);
                    }}
                    pageName={fbPage?.name || ''}
                />
            )}
        </div>
    );
}

// ======= Facebook Tab Component =======

function FacebookTabContent({
    loading,
    connected,
    page,
    posts,
    insights,
    error,
    tokenExpired,
    formatNumber,
    formatDate,
    onConnect,
    onRefresh,
}: {
    loading: boolean;
    connected: boolean;
    page: FacebookPageData | null;
    posts: FacebookPostData[];
    insights: InsightsData | null;
    error: string | null;
    tokenExpired: boolean;
    formatNumber: (v: number) => string;
    formatDate: (d: string) => string;
    onConnect: () => void;
    onRefresh: () => void;
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500">Facebook мэдээлэл ачаалж байна...</span>
                </div>
            </div>
        );
    }

    // Not connected
    if (!connected) {
        return (
            <Card className="border-dashed border-2 border-gray-200">
                <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-6">
                        <Facebook className="w-10 h-10 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Facebook Page холбох
                    </h2>
                    <p className="text-gray-500 text-center max-w-md mb-2">
                        Facebook Page-ээ холбож, нийтлэлүүд, insights, audience мэдээллийг шууд Marketing хэсгээс харна уу.
                    </p>
                    {tokenExpired && (
                        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg mb-4">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">Token хугацаа дууссан. Дахин холбоно уу.</span>
                        </div>
                    )}
                    {error && !tokenExpired && (
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg mb-4">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                    <Button
                        onClick={onConnect}
                        className="bg-blue-600 hover:bg-blue-700 text-white mt-4 px-8 py-3 text-base"
                    >
                        <Facebook className="w-5 h-5 mr-2" />
                        Facebook-ээр холбох
                    </Button>
                </CardContent>
            </Card>
        );
    }

    // Connected - show dashboard
    return (
        <div className="space-y-6">
            {/* Page Info Card */}
            <Card className="overflow-hidden">
                {page?.cover?.source && (
                    <div className="h-32 bg-gradient-to-r from-blue-600 to-blue-800 relative">
                        <img
                            src={page.cover.source}
                            alt="Cover"
                            className="w-full h-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    </div>
                )}
                {!page?.cover?.source && (
                    <div className="h-24 bg-gradient-to-r from-blue-600 to-blue-800" />
                )}
                <CardContent className="p-5 -mt-8 relative">
                    <div className="flex items-end gap-4">
                        {page?.picture?.data?.url ? (
                            <img
                                src={page.picture.data.url}
                                alt={page.name}
                                className="w-16 h-16 rounded-xl border-4 border-white shadow-lg"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-xl border-4 border-white shadow-lg bg-blue-100 flex items-center justify-center">
                                <Facebook className="w-8 h-8 text-blue-600" />
                            </div>
                        )}
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-gray-900">{page?.name}</h2>
                                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                            </div>
                            {page?.category && (
                                <p className="text-sm text-gray-500">{page.category}</p>
                            )}
                        </div>
                        {page?.link && (
                            <a
                                href={page.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Page харах
                            </a>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Дагагчид</p>
                                <p className="text-2xl font-bold mt-1">{formatNumber(page?.followers_count || 0)}</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                                <Users className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Like тоо</p>
                                <p className="text-2xl font-bold mt-1">{formatNumber(page?.fan_count || 0)}</p>
                            </div>
                            <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center">
                                <ThumbsUp className="w-6 h-6 text-pink-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Нийтлэл</p>
                                <p className="text-2xl font-bold mt-1">{posts.length}</p>
                            </div>
                            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                                <Share2 className="w-6 h-6 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Нийт engagement</p>
                                <p className="text-2xl font-bold mt-1">
                                    {formatNumber(posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0))}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                                <TrendingUp className="w-6 h-6 text-amber-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Insights */}
            {insights && (
                <Card>
                    <CardContent className="p-5">
                        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-purple-600" />
                            Page Insights
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {insights.page_impressions && (
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Impressions</p>
                                    <p className="text-lg font-bold text-gray-900">{formatNumber(insights.page_impressions.value as number)}</p>
                                </div>
                            )}
                            {insights.page_impressions_unique && (
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Reach</p>
                                    <p className="text-lg font-bold text-gray-900">{formatNumber(insights.page_impressions_unique.value as number)}</p>
                                </div>
                            )}
                            {insights.page_engaged_users && (
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Engaged Users</p>
                                    <p className="text-lg font-bold text-gray-900">{formatNumber(insights.page_engaged_users.value as number)}</p>
                                </div>
                            )}
                            {insights.page_views_total && (
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500">Page Views</p>
                                    <p className="text-lg font-bold text-gray-900">{formatNumber(insights.page_views_total.value as number)}</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Posts List */}
            <Card>
                <CardContent className="p-0">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Сүүлийн нийтлэлүүд</h3>
                        <span className="text-sm text-gray-500">{posts.length} нийтлэл</span>
                    </div>
                    {posts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Share2 className="w-12 h-12 text-gray-300 mb-3" />
                            <p className="text-gray-500">Нийтлэл байхгүй</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {posts.map(post => (
                                <div key={post.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex gap-4">
                                        {post.image && (
                                            <img
                                                src={post.image}
                                                alt=""
                                                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-gray-900 line-clamp-2 mb-2">
                                                {post.message || '(Зурган нийтлэл)'}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Heart className="w-3.5 h-3.5" />
                                                    {post.likes}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    {post.comments}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Share2 className="w-3.5 h-3.5" />
                                                    {post.shares}
                                                </span>
                                                <span className="ml-auto">{formatDate(post.created_time)}</span>
                                            </div>
                                        </div>
                                        {post.permalink && (
                                            <a
                                                href={post.permalink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4 text-gray-400" />
                                            </a>
                                        )}
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

// ======= All Posts Component =======

function AllPostsContent({
    posts,
    loading,
    totalLikes,
    totalReach,
    formatNumber,
    formatDate,
}: {
    posts: SocialPost[];
    loading: boolean;
    totalLikes: number;
    totalReach: number;
    formatNumber: (v: number) => string;
    formatDate: (d: string) => string;
}) {
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
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Нийт нийтлэл</p>
                                <p className="text-2xl font-bold mt-1">{posts.length}</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                <Share2 className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Нийт like</p>
                                <p className="text-2xl font-bold mt-1">{totalLikes.toLocaleString()}</p>
                            </div>
                            <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center">
                                <Heart className="w-6 h-6 text-pink-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Нийт хүрэлт</p>
                                <p className="text-2xl font-bold mt-1">{totalReach.toLocaleString()}</p>
                            </div>
                            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                <Eye className="w-6 h-6 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
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

// ======= Publish Modal =======

function PublishModal({
    message,
    setMessage,
    imageUrl,
    setImageUrl,
    publishing,
    publishResult,
    onPublish,
    onClose,
    pageName,
}: {
    message: string;
    setMessage: (v: string) => void;
    imageUrl: string;
    setImageUrl: (v: string) => void;
    publishing: boolean;
    publishResult: string | null;
    onPublish: () => void;
    onClose: () => void;
    pageName: string;
}) {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <Facebook className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">Шинэ нийтлэл</h3>
                            <p className="text-xs text-gray-500">{pageName} • Facebook</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-4">
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Юу бодож байна?"
                        className="w-full h-32 resize-none border border-gray-200 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={publishing}
                    />

                    {/* Image URL */}
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-gray-400" />
                        <input
                            type="url"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            placeholder="Зургийн URL (заавал биш)"
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={publishing}
                        />
                    </div>

                    {/* Result */}
                    {publishResult === 'success' && (
                        <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-3 rounded-lg">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">Амжилттай нийтлэгдлээ!</span>
                        </div>
                    )}
                    {publishResult && publishResult !== 'success' && (
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-sm">{publishResult}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                    <Button variant="outline" onClick={onClose} disabled={publishing}>
                        Болих
                    </Button>
                    <Button
                        onClick={onPublish}
                        disabled={!message.trim() || publishing}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {publishing ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Нийтэлж байна...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Нийтлэх
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ======= Instagram Tab Component =======

function InstagramTabContent({
    loading,
    connected,
    account,
    posts,
    error,
    formatNumber,
    formatDate,
    onConnect,
}: {
    loading: boolean;
    connected: boolean;
    account: any;
    posts: any[];
    error: string | null;
    formatNumber: (v: number) => string;
    formatDate: (d: string) => string;
    onConnect: () => void;
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500">Instagram мэдээлэл ачаалж байна...</span>
                </div>
            </div>
        );
    }

    if (!connected) {
        return (
            <Card className="border-dashed border-2 border-gray-200">
                <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center mb-6">
                        <Instagram className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Instagram холбох
                    </h2>
                    <p className="text-gray-500 text-center max-w-md mb-2">
                        Instagram Business аккаунтаа холбож, нийтлэлүүд, дагагчдын мэдээллийг шууд харна уу.
                    </p>
                    {error && (
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg mb-4">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                    <Button
                        onClick={onConnect}
                        className="bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 hover:opacity-90 text-white mt-4 px-8 py-3 text-base"
                    >
                        <Instagram className="w-5 h-5 mr-2" />
                        Instagram-аар холбох
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Account Info */}
            <Card className="overflow-hidden">
                <div className="h-24 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600" />
                <CardContent className="p-5 -mt-8 relative">
                    <div className="flex items-end gap-4">
                        {account?.profile_picture_url ? (
                            <img
                                src={account.profile_picture_url}
                                alt={account.username}
                                className="w-16 h-16 rounded-xl border-4 border-white shadow-lg"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-xl border-4 border-white shadow-lg bg-pink-100 flex items-center justify-center">
                                <Instagram className="w-8 h-8 text-pink-600" />
                            </div>
                        )}
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-gray-900">@{account?.username}</h2>
                                <CheckCircle2 className="w-5 h-5 text-pink-600" />
                            </div>
                            {account?.name && <p className="text-sm text-gray-500">{account.name}</p>}
                        </div>
                        {account?.username && (
                            <a
                                href={`https://instagram.com/${account.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sm text-pink-600 hover:text-pink-700"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Profile
                            </a>
                        )}
                    </div>
                    {account?.biography && (
                        <p className="text-sm text-gray-600 mt-3">{account.biography}</p>
                    )}
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{formatNumber(account?.followers_count || 0)}</p>
                        <p className="text-sm text-gray-500">Дагагчид</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{formatNumber(account?.follows_count || 0)}</p>
                        <p className="text-sm text-gray-500">Дагаж буй</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{formatNumber(account?.media_count || 0)}</p>
                        <p className="text-sm text-gray-500">Нийтлэл</p>
                    </CardContent>
                </Card>
            </div>

            {/* Posts Grid */}
            <Card>
                <CardContent className="p-0">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-900">Сүүлийн нийтлэлүүд</h3>
                    </div>
                    {posts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Instagram className="w-12 h-12 text-gray-300 mb-3" />
                            <p className="text-gray-500">Нийтлэл байхгүй</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-px bg-gray-100">
                            {posts.map((post: any) => (
                                <a
                                    key={post.id}
                                    href={post.permalink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="relative aspect-square bg-white group"
                                >
                                    {post.media_url ? (
                                        <img
                                            src={post.media_url}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                                            <Instagram className="w-8 h-8 text-gray-300" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white">
                                        <span className="flex items-center gap-1 text-sm font-medium">
                                            <Heart className="w-4 h-4" />
                                            {post.likes}
                                        </span>
                                        <span className="flex items-center gap-1 text-sm font-medium">
                                            <MessageCircle className="w-4 h-4" />
                                            {post.comments}
                                        </span>
                                    </div>
                                    {post.media_type === 'VIDEO' && (
                                        <div className="absolute top-2 right-2">
                                            <div className="bg-black/50 rounded-full p-1">
                                                <Eye className="w-3 h-3 text-white" />
                                            </div>
                                        </div>
                                    )}
                                </a>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
