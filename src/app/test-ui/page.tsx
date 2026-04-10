'use client';

import React, { useState } from 'react';
import { FloatingCartButton } from '@/components/cart/FloatingCartButton';
import { CartSummary } from '@/components/cart/CartSummary';
import { CartItemCard } from '@/components/cart/CartItemCard';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { LiveIndicator } from '@/components/ui/LiveIndicator';
import { EmptyCart } from '@/components/empty-states/EmptyCart';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { toast } from 'sonner';

export default function UIPlaygroundPage() {
    const [cartItems, setCartItems] = useState([
        {
            id: '1',
            product_id: 'p1',
            name: 'iPhone 15 Pro Max',
            image_url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch-naturaltitanium?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1692845702708',
            unit_price: 4500000,
            quantity: 1,
            variant_specs: { color: 'Natural Titanium', size: '256GB' }
        },
        {
            id: '2',
            product_id: 'p2',
            name: 'AirPods Pro (2nd Gen)',
            image_url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MTJV3?wid=1144&hei=1144&fmt=jpeg&qlt=90&.v=1694014871985',
            unit_price: 850000,
            quantity: 2,
        }
    ]);

    const [chatMessages, setChatMessages] = useState<any[]>([
        {
            id: 'm1',
            role: 'assistant',
            content: 'Сайн байна уу! Танд юугаар туслах вэ? Манай дэлгүүрийн шилдэг бүтээгдэхүүнүүдийг эндээс харах боломжтой.',
            products: [
                { id: 'p1', name: 'iPhone 15 Pro', price: 4500000, image_url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch-naturaltitanium' },
                { id: 'p2', name: 'AirPods Pro', price: 850000, image_url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MTJV3' }
            ]
        },
        {
            id: 'm2',
            role: 'user',
            content: 'iPhone 15 Pro сагсанд нэмээд өгөөч.'
        },
        {
            id: 'm3',
            role: 'assistant',
            content: 'Ойлголоо, сагсанд нэмж байна...',
            tool_calls: [
                { name: 'add_to_cart', status: 'completed' }
            ]
        }
    ]);

    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isTyping, setIsTyping] = useState(false);

    const cartTotal = cartItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    const handleUpdateQuantity = (id: string, newQty: number) => {
        setCartItems(prev => prev.map(item => item.id === id ? { ...item, quantity: newQty } : item));
    };

    const handleRemoveItem = (id: string) => {
        setCartItems(prev => prev.filter(item => item.id !== id));
        toast.error('Бараа хасагдлаа');
    };

    const handleSendMessage = (text: string) => {
        const userMsg = { id: Date.now().toString(), role: 'user', content: text };
        setChatMessages(prev => [...prev, userMsg]);

        setIsTyping(true);
        setTimeout(() => {
            setIsTyping(false);
            const aiMsg = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Таны хэлсэн "${text}" мессежийг хүлээн авлаа. Манай туслах танд туслахад бэлэн байна.`
            };
            setChatMessages(prev => [...prev, aiMsg]);
            toast.success('Шинэ мессеж ирлээ');
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-[#f8f9fa] p-4 md:p-8 pb-32">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">UI Playground</h1>
                        <p className="text-gray-500 mt-1">Syncly-ийн шинэ компонентуудыг турших хуудас</p>
                    </div>
                    <LiveIndicator label="System Online" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* LEFT COLUMN: Cart & Others */}
                    <div className="lg:col-span-4 space-y-6">
                        <section>
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Cart Summary</h2>
                            <CartSummary
                                itemCount={cartCount}
                                total={cartTotal}
                                freeShippingThreshold={5000000}
                                onViewCart={() => setIsCartOpen(true)}
                            />
                        </section>

                        <section>
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Empty State</h2>
                            <Card>
                                <EmptyCart onBrowseProducts={() => toast.info('Дэлгүүр рүү шилжлээ')} />
                            </Card>
                        </section>

                        <section>
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Toast Lab</h2>
                            <div className="grid grid-cols-2 gap-2">
                                <Button size="sm" variant="secondary" onClick={() => toast.success('Амжилттай!')}>Success</Button>
                                <Button size="sm" variant="destructive" onClick={() => toast.error('Алдаа!')}>Error</Button>
                                <Button size="sm" variant="primary" onClick={() => toast.info('Мэдээлэл')}>Info</Button>
                                <Button size="sm" variant="ghost" onClick={() => {
                                    const id = toast.loading('Уншиж байна...');
                                    setTimeout(() => toast.success('Дууслаа!', { id }), 2000);
                                }}>Loading</Button>
                            </div>
                        </section>
                    </div>

                    {/* RIGHT COLUMN: AI Chat */}
                    <div className="lg:col-span-8">
                        <section className="h-[600px] flex flex-col">
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">AI Business Assistant</h2>
                            <ChatContainer
                                messages={chatMessages}
                                isTyping={isTyping}
                                onSendMessage={handleSendMessage}
                                quickReplies={[
                                    { id: '1', text: 'Үнэ асуух', label: '💰 Үнэ асуух' },
                                    { id: '2', text: 'Хүргэлт', label: '🚚 Хүргэлт' },
                                    { id: '3', text: 'Холбоо барих', label: '📞 Холбоо барих' }
                                ]}
                                onAddToCart={(pid) => {
                                    toast.success('Сагсанд нэмэгдлээ');
                                    setCartCount(c => c + 1);
                                }}
                            />
                        </section>
                    </div>
                </div>
            </div>

            {/* MODALS & OVERLAYS */}
            <FloatingCartButton
                itemCount={cartCount}
                onClick={() => setIsCartOpen(true)}
            />

            <BottomSheet
                open={isCartOpen}
                onClose={() => setIsCartOpen(false)}
                title="🛒 Таны сагс"
            >
                {cartItems.length > 0 ? (
                    <div className="p-6 space-y-4">
                        <div className="space-y-3">
                            {cartItems.map((item) => (
                                <CartItemCard
                                    key={item.id}
                                    item={item}
                                    onUpdateQuantity={handleUpdateQuantity}
                                    onRemove={handleRemoveItem}
                                />
                            ))}
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <div className="flex justify-between items-end mb-6">
                                <span className="text-gray-500 font-medium">Нийт дүн:</span>
                                <div className="text-right">
                                    <p className="text-3xl font-black text-violet-600">
                                        {cartTotal.toLocaleString()}₮
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">НӨАТ багтсан</p>
                                </div>
                            </div>

                            <Button className="w-full py-4 text-lg font-bold shadow-xl shadow-violet-500/20">
                                Захиалга үүсгэх
                            </Button>
                        </div>
                    </div>
                ) : (
                    <EmptyCart onBrowseProducts={() => setIsCartOpen(false)} />
                )}
            </BottomSheet>
        </div>
    );
}

// Helper to manually trigger cart count updates in demo
function setCartCount(fn: (c: number) => number) {
    // This is just a placeholder to keep the code valid
}
