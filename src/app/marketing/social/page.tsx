'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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

interface AvailableFbPage {
    id: string;
    name: string;
    category?: string;
}

export default function SocialPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <SocialPageContent />
        </Suspense>
    );
}

function SocialPageContent() {
    const { shop } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>('facebook');

    // Page selector modal (after OAuth callback)
    const [pageSelectorOpen, setPageSelectorOpen] = useState(false);
    const [availablePages, setAvailablePages] = useState<AvailableFbPage[]>([]);
    const [pagesLoading, setPagesLoading] = useState(false);
    const [selectedPageId, setSelectedPageId] = useState<string>('');
    const [savingPage, setSavingPage] = useState(false);
    const [pageSelectorError, setPageSelectorError] = useState<string | null>(null);
    const [oauthBanner, setOauthBanner] = useState<string | null>(null);

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

    // ======= Handle OAuth callback (?fb_success / ?fb_error) =======
    useEffect(() => {
        const success = searchParams.get('fb_success');
        const errParam = searchParams.get('fb_error');

        if (errParam) {
            setOauthBanner(`Facebook холболт амжилтгүй: ${decodeURIComponent(errParam)}`);
            router.replace('/marketing/social');
            return;
        }

        if (success !== 'true') return;

        // Fetch pages from cookie set by callback
        let cancelled = false;
        const loadPages = async () => {
            setPagesLoading(true);
            setPageSelectorError(null);
            try {
                const res = await fetch('/api/auth/facebook/pages');
                const data = await res.json();
                if (cancelled) return;

                if (data.code === 'SESSION_EXPIRED' || !data.pages?.length) {
                    setOauthBanner('Facebook session дууссан эсвэл хуудас олдсонгүй. Дахин холбоно уу.');
                    router.replace('/marketing/social');
                    return;
                }

                setAvailablePages(data.pages);
                setSelectedPageId(data.pages[0]?.id || '');
                setPageSelectorOpen(true);
            } catch (e) {
                if (!cancelled) setPageSelectorError('Pages татахад алдаа гарлаа');
            } finally {
                if (!cancelled) setPagesLoading(false);
            }
        };
        loadPages();
        return () => { cancelled = true; };
    }, [searchParams, router]);

    // ======= Save selected page to shop =======
    const handleSavePage = useCallback(async () => {
        if (!selectedPageId) return;
        setSavingPage(true);
        setPageSelectorError(null);
        try {
            // Step 1: get the access token by selecting the page
            const selectRes = await fetch('/api/auth/facebook/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId: selectedPageId }),
            });
            const selectData = await selectRes.json();

            if (!selectRes.ok || !selectData.success) {
                throw new Error(selectData.error || 'Page сонгоход алдаа');
            }

            // Step 2: save to shop
            const patchRes = await fetch('/api/shop', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    facebook_page_id: selectData.page.id,
                    facebook_page_name: selectData.page.name,
                    facebook_page_access_token: selectData.page.access_token,
                }),
            });
            const patchData = await patchRes.json();

            if (!patchRes.ok) {
                throw new Error(patchData.error || 'Shop шинэчлэх алдаа');
            }

            setPageSelectorOpen(false);
            setOauthBanner(`✅ "${selectData.page.name}" хуудас амжилттай холбогдлоо`);
            router.replace('/marketing/social');
            // Refresh Facebook data
            fetchFacebookData();
        } catch (e: any) {
            setPageSelectorError(e?.message || 'Хадгалахад алдаа гарлаа');
        } finally {
            setSavingPage(false);
        }
    }, [selectedPageId, router, fetchFacebookData]);

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
                    <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Share2 className="w-6 h-6 text-status-success" />
                        Сошиал медиа
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Facebook & Instagram нийтлэлүүд</p>
                </div>
                {fbConnected && activeTab === 'facebook' && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => fetchFacebookData()}
                            className="text-muted-foreground"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Шинэчлэх
                        </Button>
                        <Button
                            className="bg-status-info hover:bg-status-info text-white"
                            onClick={() => setShowPublishModal(true)}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Шинэ нийтлэл
                        </Button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-surface-2 rounded-xl p-1">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                                activeTab === tab.id
                                    ? 'bg-surface text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
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

            {/* OAuth result banner */}
            {oauthBanner && (
                <div className="fixed top-4 right-4 z-50 max-w-md bg-surface border border-border rounded-lg shadow-lg p-4 flex items-start gap-3">
                    <div className="flex-1 text-sm text-foreground">{oauthBanner}</div>
                    <button
                        onClick={() => setOauthBanner(null)}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Page Selector Modal */}
            {pageSelectorOpen && (
                <PageSelectorModal
                    pages={availablePages}
                    selectedPageId={selectedPageId}
                    setSelectedPageId={setSelectedPageId}
                    saving={savingPage}
                    error={pageSelectorError}
                    onSave={handleSavePage}
                    onClose={() => {
                        setPageSelectorOpen(false);
                        router.replace('/marketing/social');
                    }}
                />
            )}
        </div>
    );
}

// ======= Page Selector Modal =======

function PageSelectorModal({
    pages,
    selectedPageId,
    setSelectedPageId,
    saving,
    error,
    onSave,
    onClose,
}: {
    pages: AvailableFbPage[];
    selectedPageId: string;
    setSelectedPageId: (v: string) => void;
    saving: boolean;
    error: string | null;
    onSave: () => void;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                        <Facebook className="w-5 h-5 text-status-info" />
                        Facebook Page сонгох
                    </h3>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
                    <p className="text-sm text-muted-foreground mb-3">
                        Холбохыг хүсэж буй Facebook Page-ээ сонгоно уу.
                    </p>
                    {pages.map(p => (
                        <label
                            key={p.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedPageId === p.id
                                    ? 'border-status-info bg-status-info-soft'
                                    : 'border-border hover:bg-surface-2'
                            }`}
                        >
                            <input
                                type="radio"
                                name="fb-page"
                                value={p.id}
                                checked={selectedPageId === p.id}
                                onChange={() => setSelectedPageId(p.id)}
                                disabled={saving}
                                className="mt-1"
                            />
                            <div className="flex-1">
                                <div className="font-medium text-foreground">{p.name}</div>
                                {p.category && (
                                    <div className="text-xs text-muted-foreground mt-0.5">{p.category}</div>
                                )}
                                <div className="text-xs text-muted-foreground mt-0.5">ID: {p.id}</div>
                            </div>
                        </label>
                    ))}
                </div>

                {error && (
                    <div className="px-5 pb-2 flex items-start gap-2 text-status-danger text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Цуцлах
                    </Button>
                    <Button
                        onClick={onSave}
                        disabled={saving || !selectedPageId}
                        className="bg-status-info hover:bg-status-info text-white"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Хадгалж байна...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Холбох
                            </>
                        )}
                    </Button>
                </div>
            </div>
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
                    <div className="w-6 h-6 border-2 border-status-info border-t-transparent rounded-full animate-spin" />
                    <span className="text-muted-foreground">Facebook мэдээлэл ачаалж байна...</span>
                </div>
            </div>
        );
    }

    // Not connected
    if (!connected) {
        return (
            <Card className="border-dashed border-2 border-border">
                <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 rounded-full bg-status-info-soft flex items-center justify-center mb-6">
                        <Facebook className="w-10 h-10 text-status-info" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground mb-2">
                        Facebook Page холбох
                    </h2>
                    <p className="text-muted-foreground text-center max-w-md mb-2">
                        Facebook Page-ээ холбож, нийтлэлүүд, insights, audience мэдээллийг шууд Marketing хэсгээс харна уу.
                    </p>
                    {tokenExpired && (
                        <div className="flex items-center gap-2 text-status-pending bg-status-pending-soft px-4 py-2 rounded-lg mb-4">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">Token хугацаа дууссан. Дахин холбоно уу.</span>
                        </div>
                    )}
                    {error && !tokenExpired && (
                        <div className="flex items-center gap-2 text-status-danger bg-status-danger-soft px-4 py-2 rounded-lg mb-4">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                    <Button
                        onClick={onConnect}
                        className="bg-status-info hover:bg-status-info text-white mt-4 px-8 py-3 text-base"
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
                            <div className="w-16 h-16 rounded-xl border-4 border-white shadow-lg bg-status-info-soft flex items-center justify-center">
                                <Facebook className="w-8 h-8 text-status-info" />
                            </div>
                        )}
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-foreground">{page?.name}</h2>
                                <CheckCircle2 className="w-5 h-5 text-status-info" />
                            </div>
                            {page?.category && (
                                <p className="text-sm text-muted-foreground">{page.category}</p>
                            )}
                        </div>
                        {page?.link && (
                            <a
                                href={page.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sm text-status-info hover:text-status-info"
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
                                <p className="text-sm text-muted-foreground">Дагагчид</p>
                                <p className="text-2xl font-bold mt-1">{formatNumber(page?.followers_count || 0)}</p>
                            </div>
                            <div className="w-12 h-12 bg-status-info-soft rounded-xl flex items-center justify-center">
                                <Users className="w-6 h-6 text-status-info" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Like тоо</p>
                                <p className="text-2xl font-bold mt-1">{formatNumber(page?.fan_count || 0)}</p>
                            </div>
                            <div className="w-12 h-12 bg-brand-soft rounded-xl flex items-center justify-center">
                                <ThumbsUp className="w-6 h-6 text-brand-strong" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Нийтлэл</p>
                                <p className="text-2xl font-bold mt-1">{posts.length}</p>
                            </div>
                            <div className="w-12 h-12 bg-status-success-soft rounded-xl flex items-center justify-center">
                                <Share2 className="w-6 h-6 text-status-success" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Нийт engagement</p>
                                <p className="text-2xl font-bold mt-1">
                                    {formatNumber(posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0))}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-status-pending-soft rounded-xl flex items-center justify-center">
                                <TrendingUp className="w-6 h-6 text-status-pending" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Insights */}
            {insights && (
                <Card>
                    <CardContent className="p-5">
                        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-brand-strong" />
                            Page Insights
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {insights.page_impressions && (
                                <div className="bg-surface-2/40 rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Impressions</p>
                                    <p className="text-lg font-bold text-foreground">{formatNumber(insights.page_impressions.value as number)}</p>
                                </div>
                            )}
                            {insights.page_impressions_unique && (
                                <div className="bg-surface-2/40 rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Reach</p>
                                    <p className="text-lg font-bold text-foreground">{formatNumber(insights.page_impressions_unique.value as number)}</p>
                                </div>
                            )}
                            {insights.page_engaged_users && (
                                <div className="bg-surface-2/40 rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Engaged Users</p>
                                    <p className="text-lg font-bold text-foreground">{formatNumber(insights.page_engaged_users.value as number)}</p>
                                </div>
                            )}
                            {insights.page_views_total && (
                                <div className="bg-surface-2/40 rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Page Views</p>
                                    <p className="text-lg font-bold text-foreground">{formatNumber(insights.page_views_total.value as number)}</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Posts List */}
            <Card>
                <CardContent className="p-0">
                    <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
                        <h3 className="font-semibold text-foreground">Сүүлийн нийтлэлүүд</h3>
                        <span className="text-sm text-muted-foreground">{posts.length} нийтлэл</span>
                    </div>
                    {posts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Share2 className="w-12 h-12 text-muted-foreground/60 mb-3" />
                            <p className="text-muted-foreground">Нийтлэл байхгүй</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {posts.map(post => (
                                <div key={post.id} className="p-4 hover:bg-surface-2/40/50 transition-colors">
                                    <div className="flex gap-4">
                                        {post.image && (
                                            <img
                                                src={post.image}
                                                alt=""
                                                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-foreground line-clamp-2 mb-2">
                                                {post.message || '(Зурган нийтлэл)'}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                                                className="flex-shrink-0 p-2 hover:bg-surface-2 rounded-lg transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4 text-muted-foreground/70" />
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
                    <div className="w-6 h-6 border-2 border-status-success border-t-transparent rounded-full animate-spin" />
                    <span className="text-muted-foreground">Татаж байна...</span>
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
                                <p className="text-sm text-muted-foreground">Нийт нийтлэл</p>
                                <p className="text-2xl font-bold mt-1">{posts.length}</p>
                            </div>
                            <div className="w-12 h-12 bg-status-info-soft rounded-xl flex items-center justify-center">
                                <Share2 className="w-6 h-6 text-status-info" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Нийт like</p>
                                <p className="text-2xl font-bold mt-1">{totalLikes.toLocaleString()}</p>
                            </div>
                            <div className="w-12 h-12 bg-brand-soft rounded-xl flex items-center justify-center">
                                <Heart className="w-6 h-6 text-brand-strong" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Нийт хүрэлт</p>
                                <p className="text-2xl font-bold mt-1">{totalReach.toLocaleString()}</p>
                            </div>
                            <div className="w-12 h-12 bg-status-success-soft rounded-xl flex items-center justify-center">
                                <Eye className="w-6 h-6 text-status-success" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    {posts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Share2 className="w-16 h-16 text-muted-foreground/60 mb-4" />
                            <h2 className="text-xl font-semibold text-foreground mb-2">Мэдээлэл байхгүй</h2>
                            <p className="text-muted-foreground">Сошиал медиа нийтлэлүүд энд харагдана.</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {posts.map(post => (
                                <div key={post.id} className="p-4 hover:bg-surface-2/40">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                {post.platform === 'facebook' ? <Facebook className="w-4 h-4 text-status-info" /> : <Instagram className="w-4 h-4 text-brand-strong" />}
                                                <span className="text-xs text-muted-foreground capitalize">{post.platform}</span>
                                                <span className={`px-2 py-0.5 text-xs rounded-full ${post.status === 'published' ? 'bg-status-success-soft text-status-success' : 'bg-surface-2 text-muted-foreground'}`}>
                                                    {post.status === 'published' ? 'Нийтлэгдсэн' : post.status === 'scheduled' ? 'Төлөвлөсөн' : 'Ноорог'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground ml-4">
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
            <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-status-info-soft flex items-center justify-center">
                            <Facebook className="w-5 h-5 text-status-info" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground">Шинэ нийтлэл</h3>
                            <p className="text-xs text-muted-foreground">{pageName} • Facebook</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-muted-foreground/70" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-4">
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Юу бодож байна?"
                        className="w-full h-32 resize-none border border-border rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={publishing}
                    />

                    {/* Image URL */}
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-muted-foreground/70" />
                        <input
                            type="url"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            placeholder="Зургийн URL (заавал биш)"
                            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={publishing}
                        />
                    </div>

                    {/* Result */}
                    {publishResult === 'success' && (
                        <div className="flex items-center gap-2 text-status-success bg-status-success-soft px-4 py-3 rounded-lg">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">Амжилттай нийтлэгдлээ!</span>
                        </div>
                    )}
                    {publishResult && publishResult !== 'success' && (
                        <div className="flex items-center gap-2 text-status-danger bg-status-danger-soft px-4 py-3 rounded-lg">
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-sm">{publishResult}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/60">
                    <Button variant="outline" onClick={onClose} disabled={publishing}>
                        Болих
                    </Button>
                    <Button
                        onClick={onPublish}
                        disabled={!message.trim() || publishing}
                        className="bg-status-info hover:bg-status-info text-white"
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
                    <span className="text-muted-foreground">Instagram мэдээлэл ачаалж байна...</span>
                </div>
            </div>
        );
    }

    if (!connected) {
        return (
            <Card className="border-dashed border-2 border-border">
                <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center mb-6">
                        <Instagram className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground mb-2">
                        Instagram холбох
                    </h2>
                    <p className="text-muted-foreground text-center max-w-md mb-2">
                        Instagram Business аккаунтаа холбож, нийтлэлүүд, дагагчдын мэдээллийг шууд харна уу.
                    </p>
                    {error && (
                        <div className="flex items-center gap-2 text-status-danger bg-status-danger-soft px-4 py-2 rounded-lg mb-4">
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
                            <div className="w-16 h-16 rounded-xl border-4 border-white shadow-lg bg-brand-soft flex items-center justify-center">
                                <Instagram className="w-8 h-8 text-brand-strong" />
                            </div>
                        )}
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-foreground">@{account?.username}</h2>
                                <CheckCircle2 className="w-5 h-5 text-brand-strong" />
                            </div>
                            {account?.name && <p className="text-sm text-muted-foreground">{account.name}</p>}
                        </div>
                        {account?.username && (
                            <a
                                href={`https://instagram.com/${account.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sm text-brand-strong hover:text-brand-strong"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Profile
                            </a>
                        )}
                    </div>
                    {account?.biography && (
                        <p className="text-sm text-muted-foreground mt-3">{account.biography}</p>
                    )}
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{formatNumber(account?.followers_count || 0)}</p>
                        <p className="text-sm text-muted-foreground">Дагагчид</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{formatNumber(account?.follows_count || 0)}</p>
                        <p className="text-sm text-muted-foreground">Дагаж буй</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{formatNumber(account?.media_count || 0)}</p>
                        <p className="text-sm text-muted-foreground">Нийтлэл</p>
                    </CardContent>
                </Card>
            </div>

            {/* Posts Grid */}
            <Card>
                <CardContent className="p-0">
                    <div className="px-5 py-4 border-b border-border/60">
                        <h3 className="font-semibold text-foreground">Сүүлийн нийтлэлүүд</h3>
                    </div>
                    {posts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Instagram className="w-12 h-12 text-muted-foreground/60 mb-3" />
                            <p className="text-muted-foreground">Нийтлэл байхгүй</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-px bg-surface-2">
                            {posts.map((post: any) => (
                                <a
                                    key={post.id}
                                    href={post.permalink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="relative aspect-square bg-surface group"
                                >
                                    {post.media_url ? (
                                        <img
                                            src={post.media_url}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-surface-2/40 flex items-center justify-center">
                                            <Instagram className="w-8 h-8 text-muted-foreground/60" />
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
