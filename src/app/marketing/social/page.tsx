'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/Dialog';
import {
    Share2, Heart, MessageCircle, Eye, Plus, Facebook, Instagram,
    TrendingUp, Users, ExternalLink, RefreshCw, Image as ImageIcon,
    Send, ThumbsUp, BarChart3, AlertCircle, CheckCircle2,
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
                    facebook_token_expires_in: selectData.page.token_expires_in ?? undefined,
                    facebook_user_access_token: selectData.page.user_access_token ?? undefined,
                    facebook_user_token_expires_in: selectData.page.user_token_expires_in ?? undefined,
                }),
            });
            const patchData = await patchRes.json();

            if (!patchRes.ok) {
                throw new Error(patchData.error || 'Shop шинэчлэх алдаа');
            }

            setPageSelectorOpen(false);
            const subNote = patchData.webhookSubscribed === false
                ? ' (⚠️ Webhook subscribe хийгдсэнгүй — App Dashboard дээр гараар тохируулна уу)'
                : '';
            setOauthBanner(`✅ "${selectData.page.name}" хуудас амжилттай холбогдлоо${subNote}`);
            router.replace('/marketing/social');
            // Refresh Facebook data
            fetchFacebookData();
        } catch (e: any) {
            setPageSelectorError(e?.message || 'Хадгалахад алдаа гарлаа');
        } finally {
            setSavingPage(false);
        }
    }, [selectedPageId, router, fetchFacebookData]);

    // ======= Disconnect platform =======
    const handleDisconnect = useCallback(async (platform: 'facebook' | 'instagram') => {
        const label = platform === 'facebook' ? 'Facebook' : 'Instagram';
        if (!window.confirm(`${label} холболтыг салгах уу? Дараа нь дахин холбож болно.`)) return;
        try {
            await fetch('/api/shop/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
        } catch { /* алдааг үл хайхран reload хийнэ */ }
        window.location.reload();
    }, []);

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
            <PageHeader
                title="Сошиал медиа"
                subtitle="Facebook & Instagram нийтлэлүүд"
                primaryAction={
                    fbConnected && activeTab === 'facebook' ? (
                        <Button onClick={() => setShowPublishModal(true)}>
                            <Plus className="w-4 h-4" />
                            Шинэ нийтлэл
                        </Button>
                    ) : undefined
                }
                secondaryActions={
                    fbConnected && activeTab === 'facebook' ? (
                        <Button variant="outline" onClick={() => fetchFacebookData()}>
                            <RefreshCw className="w-4 h-4" />
                            Шинэчлэх
                        </Button>
                    ) : undefined
                }
            />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
                <TabsList className="w-full">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <TabsTrigger key={tab.id} value={tab.id}>
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                {/* Facebook Tab */}
                <TabsContent value="facebook" className="space-y-6">
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
                        onDisconnect={() => handleDisconnect('facebook')}
                    />
                </TabsContent>

                {/* Instagram Tab */}
                <TabsContent value="instagram" className="space-y-6">
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
                </TabsContent>

                {/* All Posts Tab */}
                <TabsContent value="all" className="space-y-6">
                    <AllPostsContent
                        posts={posts}
                        loading={loadingPosts}
                        totalLikes={totalLikes}
                        totalReach={totalReach}
                        formatNumber={formatNumber}
                        formatDate={formatDate}
                    />
                </TabsContent>
            </Tabs>

            {/* Publish Modal */}
            <PublishModal
                open={showPublishModal}
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

            {/* OAuth result banner */}
            {oauthBanner && (
                <div className="fixed top-4 right-4 z-50 max-w-md bg-surface border border-border rounded-xl shadow-lg p-4 flex items-start gap-3">
                    <div className="flex-1 text-sm text-foreground">{oauthBanner}</div>
                    <button
                        onClick={() => setOauthBanner(null)}
                        className="text-muted-foreground hover:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Page Selector Modal */}
            <PageSelectorModal
                open={pageSelectorOpen}
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
        </div>
    );
}

// ======= Page Selector Modal =======

function PageSelectorModal({
    open,
    pages,
    selectedPageId,
    setSelectedPageId,
    saving,
    error,
    onSave,
    onClose,
}: {
    open: boolean;
    pages: AvailableFbPage[];
    selectedPageId: string;
    setSelectedPageId: (v: string) => void;
    saving: boolean;
    error: string | null;
    onSave: () => void;
    onClose: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
            <DialogContent showCloseButton={false} className="bg-surface p-0 sm:max-w-md">
                <DialogHeader className="flex flex-row items-center justify-between gap-2 px-5 py-4 border-b border-border space-y-0">
                    <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <Facebook className="w-5 h-5 text-status-info" />
                        Facebook Page сонгох
                    </DialogTitle>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </DialogHeader>

                <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
                    <p className="text-sm text-muted-foreground mb-3">
                        Холбохыг хүсэж буй Facebook Page-ээ сонгоно уу.
                    </p>
                    {pages.map(p => (
                        <label
                            key={p.id}
                            className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
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
                                className="mt-1 accent-[var(--brand)]"
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
                    <div className="px-5 pb-2">
                        <Alert variant="danger">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    </div>
                )}

                <DialogFooter className="px-5 py-4 border-t border-border">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Цуцлах
                    </Button>
                    <Button
                        onClick={onSave}
                        disabled={saving || !selectedPageId}
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Хадгалж байна...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Холбох
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
    onDisconnect,
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
    onDisconnect: () => void;
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-status-info" />
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
                    <h2 className="heading-section text-xl text-foreground mb-2">
                        Facebook Page холбох
                    </h2>
                    <p className="text-muted-foreground text-center max-w-md mb-2">
                        Facebook Page-ээ холбож, нийтлэлүүд, insights, audience мэдээллийг шууд Marketing хэсгээс харна уу.
                    </p>
                    {tokenExpired && (
                        <div className="w-full max-w-md mt-2 mb-2">
                            <Alert variant="warning">
                                <AlertDescription>Token хугацаа дууссан. Дахин холбоно уу.</AlertDescription>
                            </Alert>
                        </div>
                    )}
                    {error && !tokenExpired && (
                        <div className="w-full max-w-md mt-2 mb-2">
                            <Alert variant="danger">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        </div>
                    )}
                    <Button
                        onClick={onConnect}
                        size="lg"
                        className="mt-4"
                    >
                        <Facebook className="w-5 h-5" />
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
                    <div className="h-32 bg-status-info-soft relative">
                        <img
                            src={page.cover.source}
                            alt="Cover"
                            className="w-full h-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    </div>
                )}
                {!page?.cover?.source && (
                    <div className="h-24 bg-status-info-soft" />
                )}
                <CardContent className="p-5 -mt-8 relative">
                    <div className="flex items-end gap-4">
                        {page?.picture?.data?.url ? (
                            <img
                                src={page.picture.data.url}
                                alt={page.name}
                                className="w-16 h-16 rounded-xl border-4 border-surface shadow-lg"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-xl border-4 border-surface shadow-lg bg-status-info-soft flex items-center justify-center">
                                <Facebook className="w-8 h-8 text-status-info" />
                            </div>
                        )}
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2">
                                <h2 className="heading-section text-lg text-foreground">{page?.name}</h2>
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
                                className="flex items-center gap-1 text-sm text-status-info hover:opacity-80"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Page харах
                            </a>
                        )}
                        <button
                            onClick={onDisconnect}
                            className="flex items-center gap-1 text-sm text-status-danger hover:opacity-80 ml-3"
                        >
                            <AlertCircle className="w-4 h-4" />
                            Салгах
                        </button>
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                    title="Дагагчид"
                    value={formatNumber(page?.followers_count || 0)}
                    icon={Users}
                    iconColor="info"
                />
                <StatsCard
                    title="Like тоо"
                    value={formatNumber(page?.fan_count || 0)}
                    icon={ThumbsUp}
                    iconColor="brand"
                />
                <StatsCard
                    title="Нийтлэл"
                    value={posts.length}
                    icon={Share2}
                    iconColor="success"
                />
                <StatsCard
                    title="Нийт engagement"
                    value={formatNumber(posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0))}
                    icon={TrendingUp}
                    iconColor="warning"
                />
            </div>

            {/* Insights */}
            {insights && (
                <Card>
                    <CardContent className="p-5">
                        <h3 className="heading-section text-foreground mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-brand-strong" />
                            Page Insights
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {insights.page_impressions && (
                                <div className="bg-surface-2 rounded-md p-3">
                                    <p className="text-xs text-muted-foreground">Impressions</p>
                                    <p className="text-lg font-bold text-foreground tabular-nums">{formatNumber(insights.page_impressions.value as number)}</p>
                                </div>
                            )}
                            {insights.page_impressions_unique && (
                                <div className="bg-surface-2 rounded-md p-3">
                                    <p className="text-xs text-muted-foreground">Reach</p>
                                    <p className="text-lg font-bold text-foreground tabular-nums">{formatNumber(insights.page_impressions_unique.value as number)}</p>
                                </div>
                            )}
                            {insights.page_engaged_users && (
                                <div className="bg-surface-2 rounded-md p-3">
                                    <p className="text-xs text-muted-foreground">Engaged Users</p>
                                    <p className="text-lg font-bold text-foreground tabular-nums">{formatNumber(insights.page_engaged_users.value as number)}</p>
                                </div>
                            )}
                            {insights.page_views_total && (
                                <div className="bg-surface-2 rounded-md p-3">
                                    <p className="text-xs text-muted-foreground">Page Views</p>
                                    <p className="text-lg font-bold text-foreground tabular-nums">{formatNumber(insights.page_views_total.value as number)}</p>
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
                        <h3 className="heading-section text-foreground">Сүүлийн нийтлэлүүд</h3>
                        <span className="text-sm text-muted-foreground">{posts.length} нийтлэл</span>
                    </div>
                    {posts.length === 0 ? (
                        <EmptyState
                            icon={<Share2 className="w-7 h-7" />}
                            title="Нийтлэл байхгүй"
                        />
                    ) : (
                        <div className="divide-y divide-border/60">
                            {posts.map(post => (
                                <div key={post.id} className="p-4 hover:bg-surface-2/50 transition-colors">
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
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
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
                                                <ExternalLink className="w-4 h-4 text-muted-foreground" />
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
                    <Loader2 className="w-6 h-6 animate-spin text-status-success" />
                    <span className="text-muted-foreground">Татаж байна...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatsCard
                    title="Нийт нийтлэл"
                    value={posts.length}
                    icon={Share2}
                    iconColor="info"
                />
                <StatsCard
                    title="Нийт like"
                    value={totalLikes.toLocaleString()}
                    icon={Heart}
                    iconColor="brand"
                />
                <StatsCard
                    title="Нийт хүрэлт"
                    value={totalReach.toLocaleString()}
                    icon={Eye}
                    iconColor="success"
                />
            </div>

            <Card>
                <CardContent className="p-0">
                    {posts.length === 0 ? (
                        <EmptyState
                            icon={<Share2 className="w-7 h-7" />}
                            title="Мэдээлэл байхгүй"
                            description="Сошиал медиа нийтлэлүүд энд харагдана."
                        />
                    ) : (
                        <div className="divide-y divide-border/60">
                            {posts.map(post => (
                                <div key={post.id} className="p-4 hover:bg-surface-2/50">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                {post.platform === 'facebook' ? <Facebook className="w-4 h-4 text-status-info" /> : <Instagram className="w-4 h-4 text-brand-strong" />}
                                                <span className="text-xs text-muted-foreground capitalize">{post.platform}</span>
                                                <StatusPill variant={post.status === 'published' ? 'success' : 'neutral'}>
                                                    {post.status === 'published' ? 'Нийтлэгдсэн' : post.status === 'scheduled' ? 'Төлөвлөсөн' : 'Ноорог'}
                                                </StatusPill>
                                            </div>
                                            <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground ml-4 tabular-nums">
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
    open,
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
    open: boolean;
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
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent showCloseButton={false} className="bg-surface p-0 sm:max-w-lg">
                {/* Header */}
                <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border/60 space-y-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-status-info-soft flex items-center justify-center">
                            <Facebook className="w-5 h-5 text-status-info" />
                        </div>
                        <div className="text-left">
                            <DialogTitle className="font-semibold text-foreground">Шинэ нийтлэл</DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">{pageName} • Facebook</DialogDescription>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </DialogHeader>

                {/* Body */}
                <div className="px-6 py-4 space-y-4">
                    <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Юу бодож байна?"
                        className="h-32 resize-none"
                        disabled={publishing}
                    />

                    {/* Image URL */}
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        <Input
                            type="url"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            placeholder="Зургийн URL (заавал биш)"
                            disabled={publishing}
                        />
                    </div>

                    {/* Result */}
                    {publishResult === 'success' && (
                        <Alert variant="success">
                            <AlertDescription className="font-medium">Амжилттай нийтлэгдлээ!</AlertDescription>
                        </Alert>
                    )}
                    {publishResult && publishResult !== 'success' && (
                        <Alert variant="danger">
                            <AlertDescription>{publishResult}</AlertDescription>
                        </Alert>
                    )}
                </div>

                {/* Footer */}
                <DialogFooter className="px-6 py-4 border-t border-border/60">
                    <Button variant="outline" onClick={onClose} disabled={publishing}>
                        Болих
                    </Button>
                    <Button
                        onClick={onPublish}
                        disabled={!message.trim() || publishing}
                    >
                        {publishing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Нийтэлж байна...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Нийтлэх
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
                    <Loader2 className="w-6 h-6 animate-spin text-brand-strong" />
                    <span className="text-muted-foreground">Instagram мэдээлэл ачаалж байна...</span>
                </div>
            </div>
        );
    }

    if (!connected) {
        return (
            <Card className="border-dashed border-2 border-border">
                <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 rounded-full bg-brand-soft flex items-center justify-center mb-6">
                        <Instagram className="w-10 h-10 text-brand-strong" />
                    </div>
                    <h2 className="heading-section text-xl text-foreground mb-2">
                        Instagram холбох
                    </h2>
                    <p className="text-muted-foreground text-center max-w-md mb-2">
                        Instagram Business аккаунтаа холбож, нийтлэлүүд, дагагчдын мэдээллийг шууд харна уу.
                    </p>
                    {error && (
                        <div className="w-full max-w-md mt-2 mb-2">
                            <Alert variant="danger">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        </div>
                    )}
                    <Button
                        onClick={onConnect}
                        size="lg"
                        className="mt-4"
                    >
                        <Instagram className="w-5 h-5" />
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
                <div className="h-24 bg-brand-soft" />
                <CardContent className="p-5 -mt-8 relative">
                    <div className="flex items-end gap-4">
                        {account?.profile_picture_url ? (
                            <img
                                src={account.profile_picture_url}
                                alt={account.username}
                                className="w-16 h-16 rounded-xl border-4 border-surface shadow-lg"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-xl border-4 border-surface shadow-lg bg-brand-soft flex items-center justify-center">
                                <Instagram className="w-8 h-8 text-brand-strong" />
                            </div>
                        )}
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2">
                                <h2 className="heading-section text-lg text-foreground">@{account?.username}</h2>
                                <CheckCircle2 className="w-5 h-5 text-brand-strong" />
                            </div>
                            {account?.name && <p className="text-sm text-muted-foreground">{account.name}</p>}
                        </div>
                        {account?.username && (
                            <a
                                href={`https://instagram.com/${account.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sm text-brand-strong hover:opacity-80"
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
                        <p className="heading-display text-2xl text-foreground tabular-nums">{formatNumber(account?.followers_count || 0)}</p>
                        <p className="text-sm text-muted-foreground">Дагагчид</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="heading-display text-2xl text-foreground tabular-nums">{formatNumber(account?.follows_count || 0)}</p>
                        <p className="text-sm text-muted-foreground">Дагаж буй</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="heading-display text-2xl text-foreground tabular-nums">{formatNumber(account?.media_count || 0)}</p>
                        <p className="text-sm text-muted-foreground">Нийтлэл</p>
                    </CardContent>
                </Card>
            </div>

            {/* Posts Grid */}
            <Card>
                <CardContent className="p-0">
                    <div className="px-5 py-4 border-b border-border/60">
                        <h3 className="heading-section text-foreground">Сүүлийн нийтлэлүүд</h3>
                    </div>
                    {posts.length === 0 ? (
                        <EmptyState
                            icon={<Instagram className="w-7 h-7" />}
                            title="Нийтлэл байхгүй"
                        />
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
                                        <div className="w-full h-full bg-surface-2 flex items-center justify-center">
                                            <Instagram className="w-8 h-8 text-muted-foreground" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white">
                                        <span className="flex items-center gap-1 text-sm font-medium tabular-nums">
                                            <Heart className="w-4 h-4" />
                                            {post.likes}
                                        </span>
                                        <span className="flex items-center gap-1 text-sm font-medium tabular-nums">
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
