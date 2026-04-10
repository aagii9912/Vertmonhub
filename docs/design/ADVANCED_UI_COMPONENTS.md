# SmartHub Advanced UI Components 🛒💬

> Cart, Chat, Toast, Empty States, Realtime, Bottom Sheet UI-ийн бүрэн баримт бичиг

---

## 📋 Гарчиг

1. [Cart Components](#-cart-components)
2. [AI Chat Interface](#-ai-chat-interface)
3. [Toast Notifications](#-toast-notifications)
4. [Empty States](#-empty-states)
5. [Real-time Updates UI](#-real-time-updates-ui)
6. [Mobile Bottom Sheet](#-mobile-bottom-sheet)

---

## 🛒 Cart Components

### Floating Cart Button

Бүх хуудсанд харагдах floating cart товч:

```tsx
// components/cart/FloatingCartButton.tsx
import { ShoppingCart } from 'lucide-react';

interface FloatingCartButtonProps {
  itemCount: number;
  onClick: () => void;
}

export function FloatingCartButton({ itemCount, onClick }: FloatingCartButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-50 
                 w-14 h-14 rounded-full 
                 bg-gradient-to-r from-violet-600 to-indigo-600 
                 text-white shadow-lg shadow-violet-500/30 
                 flex items-center justify-center 
                 hover:scale-105 active:scale-95 transition-transform"
    >
      <ShoppingCart className="w-6 h-6" />
      {itemCount > 0 && (
        <span className="absolute -top-1 -right-1 
                        w-6 h-6 rounded-full bg-red-500 
                        text-xs font-bold 
                        flex items-center justify-center 
                        animate-bounce">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  );
}
```

---

### Cart Summary Header

Сагсны хураангуй мэдээлэл + үнэгүй хүргэлт progress:

```tsx
// components/cart/CartSummary.tsx
import { ShoppingBag, ChevronRight } from 'lucide-react';

interface CartSummaryProps {
  itemCount: number;
  total: number;
  freeShippingThreshold: number;
  onViewCart: () => void;
}

export function CartSummary({ 
  itemCount, 
  total, 
  freeShippingThreshold = 50000,
  onViewCart 
}: CartSummaryProps) {
  const progress = Math.min((total / freeShippingThreshold) * 100, 100);
  const remaining = Math.max(freeShippingThreshold - total, 0);
  
  return (
    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 
                    rounded-2xl p-4 border border-violet-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-violet-600" />
          <span className="font-medium text-gray-900">
            {itemCount} бараа сагсанд
          </span>
        </div>
        <button 
          onClick={onViewCart}
          className="text-sm text-violet-600 font-medium flex items-center gap-1 
                     hover:text-violet-700 transition"
        >
          Харах
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      
      {/* Free Shipping Progress */}
      {remaining > 0 ? (
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-gray-600">Үнэгүй хүргэлт хүртэл</span>
            <span className="font-medium text-violet-600">
              {remaining.toLocaleString()}₮
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 
                         rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-emerald-600">
          <span className="text-lg">🎉</span>
          <span className="font-medium">Үнэгүй хүргэлт идэвхжлээ!</span>
        </div>
      )}
    </div>
  );
}
```

---

### Cart Item Card

Сагс дахь бараа тус бүрийн карт:

```tsx
// components/cart/CartItemCard.tsx
import { Minus, Plus, Trash2 } from 'lucide-react';

interface CartItem {
  id: string;
  product_id: string;
  name: string;
  image_url: string;
  unit_price: number;
  quantity: number;
  variant_specs?: {
    color?: string;
    size?: string;
  };
}

interface CartItemCardProps {
  item: CartItem;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}

export function CartItemCard({ item, onUpdateQuantity, onRemove }: CartItemCardProps) {
  return (
    <div className="flex gap-3 p-3 bg-white rounded-xl border border-gray-100">
      {/* Image */}
      <img 
        src={item.image_url || '/placeholder.png'} 
        alt={item.name}
        className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
      />
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 truncate">{item.name}</h4>
        
        {/* Variant */}
        {item.variant_specs && (
          <p className="text-sm text-gray-500 mt-0.5">
            {item.variant_specs.color} / {item.variant_specs.size}
          </p>
        )}
        
        {/* Price & Quantity */}
        <div className="flex items-center justify-between mt-2">
          <span className="font-semibold text-gray-900">
            {item.unit_price.toLocaleString()}₮
          </span>
          
          <div className="flex items-center gap-2">
            {/* Quantity Controls */}
            <button
              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
              disabled={item.quantity <= 1}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center
                         hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed
                         transition"
            >
              <Minus className="w-4 h-4" />
            </button>
            
            <span className="w-8 text-center font-medium">{item.quantity}</span>
            
            <button
              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center
                         hover:bg-gray-200 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
            
            {/* Remove */}
            <button
              onClick={() => onRemove(item.id)}
              className="w-8 h-8 rounded-full bg-red-50 text-red-500 
                         flex items-center justify-center
                         hover:bg-red-100 transition ml-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### useCart Hook

Cart state management hook:

```tsx
// hooks/useCart.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CartItem {
  id: string;
  product_id: string;
  name: string;
  image_url: string;
  unit_price: number;
  quantity: number;
  variant_specs?: { color?: string; size?: string };
}

interface Cart {
  items: CartItem[];
  total: number;
  item_count: number;
}

export function useCart(sessionId?: string) {
  const queryClient = useQueryClient();
  
  // Fetch cart
  const { data: cart, isLoading } = useQuery<Cart>({
    queryKey: ['cart', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/cart?sessionId=${sessionId}`);
      if (!res.ok) throw new Error('Failed to fetch cart');
      return res.json();
    },
    enabled: !!sessionId,
  });
  
  // Add to cart
  const addItem = useMutation({
    mutationFn: async (item: Partial<CartItem>) => {
      const res = await fetch('/api/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...item }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', sessionId] });
    },
  });
  
  // Update quantity
  const updateQuantity = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const res = await fetch('/api/cart/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, itemId, quantity }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', sessionId] });
    },
  });
  
  // Remove item
  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await fetch(`/api/cart/remove?sessionId=${sessionId}&itemId=${itemId}`, {
        method: 'DELETE',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', sessionId] });
    },
  });
  
  // Clear cart
  const clearCart = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cart/clear?sessionId=${sessionId}`, {
        method: 'DELETE',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', sessionId] });
    },
  });
  
  return {
    cart: cart ?? { items: [], total: 0, item_count: 0 },
    isLoading,
    addItem: addItem.mutate,
    updateQuantity: updateQuantity.mutate,
    removeItem: removeItem.mutate,
    clearCart: clearCart.mutate,
    isUpdating: addItem.isPending || updateQuantity.isPending || removeItem.isPending,
  };
}
```

---

## 💬 AI Chat Interface

### Chat Container

Чат харилцааны үндсэн container:

```tsx
// components/chat/ChatContainer.tsx
import { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  tool_calls?: ToolCall[];
}

interface ChatContainerProps {
  messages: Message[];
  isTyping: boolean;
  onSendMessage: (message: string) => void;
  quickReplies?: QuickReply[];
}

export function ChatContainer({ 
  messages, 
  isTyping, 
  onSendMessage, 
  quickReplies 
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);
  
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        
        {isTyping && <TypingIndicator />}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Quick Replies */}
      {quickReplies && quickReplies.length > 0 && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto no-scrollbar">
          {quickReplies.map((reply) => (
            <button
              key={reply.id}
              onClick={() => onSendMessage(reply.text)}
              className="flex-shrink-0 px-3 py-1.5 
                         bg-white border border-gray-200 rounded-full 
                         text-sm hover:bg-gray-50 transition"
            >
              {reply.icon} {reply.label}
            </button>
          ))}
        </div>
      )}
      
      {/* Input */}
      <ChatInput onSend={onSendMessage} disabled={isTyping} />
    </div>
  );
}
```

---

### Message Bubble

Хэрэглэгч болон AI-ийн мессеж:

```tsx
// components/chat/MessageBubble.tsx
import { Bot } from 'lucide-react';
import { ProductCardInChat } from './ProductCardInChat';
import { ToolProcessingIndicator } from './ToolProcessingIndicator';

interface MessageBubbleProps {
  message: {
    role: 'user' | 'assistant';
    content: string;
    products?: Product[];
    tool_calls?: { name: string; status: 'pending' | 'completed' }[];
  };
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* AI Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 
                        flex items-center justify-center mr-2 flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}
      
      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        {/* Message Content */}
        <div className={`
          px-4 py-2.5 rounded-2xl
          ${isUser 
            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-md' 
            : 'bg-white border border-gray-100 text-gray-900 rounded-bl-md shadow-sm'
          }
        `}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
        
        {/* Tool Processing */}
        {message.tool_calls?.map((tool, i) => (
          <ToolProcessingIndicator 
            key={i} 
            toolName={tool.name} 
            status={tool.status} 
          />
        ))}
        
        {/* Product Cards */}
        {message.products && message.products.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.products.map((product) => (
              <ProductCardInChat key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### Typing Indicator

AI бичиж байна indicator:

```tsx
// components/chat/TypingIndicator.tsx
import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="flex items-start">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 
                      flex items-center justify-center mr-2 flex-shrink-0">
        <Bot className="w-4 h-4 text-white" />
      </div>
      
      <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md 
                      px-4 py-3 shadow-sm">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
```

---

### Tool Processing Indicator

AI tool ажиллаж байхад харуулах:

```tsx
// components/chat/ToolProcessingIndicator.tsx
import { Loader2, CheckCircle, ShoppingCart, User, CreditCard } from 'lucide-react';

interface ToolProcessingIndicatorProps {
  toolName: string;
  status: 'pending' | 'completed';
}

const toolConfig: Record<string, { icon: React.ReactNode; label: string }> = {
  add_to_cart: { icon: <ShoppingCart className="w-4 h-4" />, label: 'Сагсанд нэмж байна...' },
  checkout: { icon: <CreditCard className="w-4 h-4" />, label: 'Захиалга үүсгэж байна...' },
  collect_contact_info: { icon: <User className="w-4 h-4" />, label: 'Мэдээлэл хадгалж байна...' },
};

export function ToolProcessingIndicator({ toolName, status }: ToolProcessingIndicatorProps) {
  const config = toolConfig[toolName] || { icon: null, label: toolName };
  
  return (
    <div className="flex items-center gap-2 mt-2 ml-10 text-sm text-gray-500">
      {status === 'pending' ? (
        <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
      ) : (
        <CheckCircle className="w-4 h-4 text-emerald-500" />
      )}
      {config.icon}
      <span>{status === 'completed' ? config.label.replace('байна...', 'сан!') : config.label}</span>
    </div>
  );
}
```

---

### Product Card in Chat

Чат дотор бүтээгдэхүүн харуулах:

```tsx
// components/chat/ProductCardInChat.tsx
import { ShoppingCart } from 'lucide-react';

interface ProductCardInChatProps {
  product: {
    id: string;
    name: string;
    description?: string;
    price: number;
    image_url?: string;
  };
  onAddToCart?: (productId: string) => void;
}

export function ProductCardInChat({ product, onAddToCart }: ProductCardInChatProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden 
                    shadow-sm hover:shadow-md transition max-w-[280px]">
      {/* Image */}
      {product.image_url && (
        <img 
          src={product.image_url} 
          alt={product.name}
          className="w-full h-32 object-cover"
        />
      )}
      
      {/* Content */}
      <div className="p-3">
        <h4 className="font-medium text-gray-900 text-sm">{product.name}</h4>
        
        {product.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
            {product.description}
          </p>
        )}
        
        <div className="flex items-center justify-between mt-3">
          <span className="font-bold text-violet-600">
            {product.price.toLocaleString()}₮
          </span>
          
          {onAddToCart && (
            <button
              onClick={() => onAddToCart(product.id)}
              className="flex items-center gap-1 px-3 py-1.5 
                         bg-violet-600 text-white text-xs font-medium 
                         rounded-lg hover:bg-violet-700 transition"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Сагслах
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

### Chat Input

Мессеж бичих input:

```tsx
// components/chat/ChatInput.tsx
import { useState } from 'react';
import { Send, Mic, Image } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Мессеж бичих...' }: ChatInputProps) {
  const [message, setMessage] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-gray-100">
      <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2">
        {/* Attachment buttons */}
        <button 
          type="button"
          className="p-2 text-gray-400 hover:text-gray-600 transition"
        >
          <Image className="w-5 h-5" />
        </button>
        
        {/* Input */}
        <input
          type="text"
## 🔔 Toast Notifications

### Setup

```bash
npm install sonner
```

### Provider Setup

```tsx
// app/layout.tsx
import { Toaster } from 'sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body>
        {children}
        <Toaster 
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
            className: 'rounded-xl',
          }}
        />
      </body>
    </html>
  );
}
```

### Usage Examples

```tsx
import { toast } from 'sonner';

// Success Toast
toast.success('Амжилттай нэмэгдлээ!', {
  description: 'iPhone 15 Pro (x1) сагсанд орлоо',
  action: {
    label: 'Сагс харах',
    onClick: () => setShowCart(true)
  }
});

// Error Toast
toast.error('Үлдэгдэл хүрэлцэхгүй', {
  description: 'Зөвхөн 3 ширхэг үлдсэн байна'
});

// Warning Toast
toast.warning('Анхааруулга', {
  description: 'Энэ бараа удахгүй дуусна'
});

// Loading → Success Pattern
const toastId = toast.loading('Захиалга үүсгэж байна...');

try {
  await createOrder();
  toast.success('Захиалга амжилттай үүслээ!', { id: toastId });
} catch (error) {
  toast.error('Алдаа гарлаа', { id: toastId });
}

// Promise-based
toast.promise(checkoutCart(), {
  loading: 'Боловсруулж байна...',
  success: 'Захиалга амжилттай!',
  error: 'Алдаа гарлаа. Дахин оролдоно уу.'
});
```

### Custom Toast Styles

```css
/* globals.css */

/* Toast container */
[data-sonner-toaster] {
  font-family: var(--font-sans);
}

/* All toasts */
[data-sonner-toast] {
  border-radius: 12px !important;
  padding: 16px !important;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15) !important;
}

/* Success toast */
[data-sonner-toast][data-type="success"] {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  border: none !important;
}

/* Error toast */
[data-sonner-toast][data-type="error"] {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
  border: none !important;
}

/* Action button */
[data-sonner-toast] [data-button] {
  background: rgba(255, 255, 255, 0.2) !important;
  border-radius: 8px !important;
}
```

---

## 📭 Empty States

### Empty Cart

```tsx
// components/empty-states/EmptyCart.tsx
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface EmptyCartProps {
  onBrowseProducts: () => void;
}

export function EmptyCart({ onBrowseProducts }: EmptyCartProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-20 h-20 rounded-full bg-gray-100 
                      flex items-center justify-center mb-4">
        <ShoppingCart className="w-10 h-10 text-gray-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        Сагс хоосон байна
      </h3>
      
      <p className="text-sm text-gray-500 text-center mb-6">
        Барааны жагсаалтаас сонгоод нэмнэ үү
      </p>
      
      <Button onClick={onBrowseProducts}>
        Бараа үзэх
      </Button>
    </div>
  );
}
```

---

### No Orders

```tsx
// components/empty-states/NoOrders.tsx
import { Package } from 'lucide-react';

export function NoOrders() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-24 h-24 rounded-full bg-violet-50 
                      flex items-center justify-center mb-6">
        <Package className="w-12 h-12 text-violet-400" />
      </div>
      
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        Захиалга хараахан байхгүй байна
      </h3>
      
      <p className="text-gray-500">
        Эхний захиалга хүлээж байна 🎉
      </p>
    </div>
  );
}
```

---

### No Search Results

```tsx
// components/empty-states/NoSearchResults.tsx
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface NoSearchResultsProps {
  query: string;
  onClear: () => void;
}

export function NoSearchResults({ query, onClear }: NoSearchResultsProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-full bg-gray-100 
                      flex items-center justify-center mb-4">
        <Search className="w-8 h-8 text-gray-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        "{query}" хайлтад илэрц олдсонгүй
      </h3>
      
      <p className="text-sm text-gray-500 text-center mb-4">
        Өөр түлхүүр үгээр хайна уу
      </p>
      
      <Button variant="secondary" onClick={onClear}>
        Хайлт цэвэрлэх
      </Button>
    </div>
  );
}
```

---

### No Customers

```tsx
// components/empty-states/NoCustomers.tsx
import { Users } from 'lucide-react';

export function NoCustomers() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-24 h-24 rounded-full bg-blue-50 
                      flex items-center justify-center mb-6">
        <Users className="w-12 h-12 text-blue-400" />
      </div>
      
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        Харилцагч байхгүй байна
      </h3>
      
      <p className="text-gray-500 text-center max-w-sm">
        AI чатбот эсвэл Messenger-ээр харилцагчид холбогдоход 
        автоматаар бүртгэгдэнэ.
      </p>
    </div>
  );
}
```

---

## 🔴 Real-time Updates UI

### Live Dot Indicator

Real-time холболт идэвхтэй байгааг харуулах:

```tsx
// components/ui/LiveIndicator.tsx

interface LiveIndicatorProps {
  label?: string;
}

export function LiveIndicator({ label = 'Live' }: LiveIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        {/* Ping animation */}
        <span className="animate-ping absolute inline-flex h-full w-full 
                        rounded-full bg-emerald-400 opacity-75" />
        {/* Solid dot */}
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 
                        bg-emerald-500" />
      </span>
      <span className="text-xs font-medium text-emerald-600">{label}</span>
    </div>
  );
}
```

---

### New Order Notification

Шинэ захиалга ирэхэд sound + toast:

```tsx
// hooks/useOrderNotifications.ts
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export function useOrderNotifications(shopId: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
    // Preload audio
    audioRef.current = new Audio('/sounds/notification.mp3');
    
    // Subscribe to new orders
    const channel = supabase
      .channel('orders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          // Play sound
          audioRef.current?.play().catch(() => {});
          
          // Show toast
          toast.success('🎉 Шинэ захиалга!', {
            description: `${payload.new.total_amount?.toLocaleString()}₮`,
            action: {
              label: 'Харах',
              onClick: () => window.location.href = `/dashboard/orders`,
            },
            duration: 10000,
          });
        }
      )
      .subscribe();
    
    return () => {
      channel.unsubscribe();
    };
  }, [shopId]);
}
```

---

### Pulse Animation for New Items

Шинэ items дээр анхаарал татах:

```tsx
// components/ui/NewItemHighlight.tsx
interface NewItemHighlightProps {
  children: React.ReactNode;
  isNew?: boolean;
}

export function NewItemHighlight({ children, isNew = false }: NewItemHighlightProps) {
  return (
    <div className={isNew ? 'animate-pulse-slow ring-2 ring-violet-500 ring-offset-2 rounded-xl' : ''}>
      {children}
    </div>
  );
}
```

```css
/* globals.css */
@keyframes pulse-slow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.animate-pulse-slow {
  animation: pulse-slow 2s ease-in-out 3;
}
```

---

## 📱 Mobile Bottom Sheet

### Bottom Sheet Component

Mobile-д modal-ийн оронд доороос гарч ирэх sheet:

```tsx
// components/ui/BottomSheet.tsx
'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  
  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 
                   bg-white rounded-t-3xl 
                   max-h-[90vh] overflow-hidden
                   animate-slide-up"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        
        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] pb-safe">
          {children}
        </div>
      </div>
    </div>
  );
}
```

---

### Usage Examples

```tsx
// Cart Bottom Sheet
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CartItemCard } from '@/components/cart/CartItemCard';

function CartSheet({ open, onClose, cart }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="🛒 Сагс">
      <div className="p-4 space-y-3">
        {cart.items.map((item) => (
          <CartItemCard key={item.id} item={item} />
        ))}
        
        {/* Total */}
        <div className="pt-4 border-t">
          <div className="flex justify-between text-lg font-bold">
            <span>Нийт:</span>
            <span>{cart.total.toLocaleString()}₮</span>
          </div>
          
          <button className="w-full mt-4 py-3 bg-violet-600 text-white 
                            rounded-xl font-medium hover:bg-violet-700 transition">
            Захиалах
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
```

```tsx
// Filter Bottom Sheet
function FilterSheet({ open, onClose, filters, onApply }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Шүүлтүүр">
      <div className="p-4 space-y-6">
        {/* Price Range */}
        <div>
          <label className="block text-sm font-medium mb-2">Үнийн хязгаар</label>
          <div className="flex gap-2">
            <input type="number" placeholder="Min" className="..." />
            <input type="number" placeholder="Max" className="..." />
          </div>
        </div>
        
        {/* Category */}
        <div>
          <label className="block text-sm font-medium mb-2">Ангилал</label>
          {/* Category checkboxes */}
        </div>
        
        {/* Apply */}
        <button 
          onClick={onApply}
          className="w-full py-3 bg-violet-600 text-white rounded-xl"
        >
          Хайх
        </button>
      </div>
    </BottomSheet>
  );
}
```

---

## 📋 Component Checklist Update

Бүх component-д дараах зүйлсийг нэмж шалгана:

- [ ] Cart actions feedback (toast)
- [ ] Empty state handling
- [ ] Loading skeleton
- [ ] Real-time update support
- [ ] Bottom sheet for mobile modals
- [ ] AI tool processing indicators
- [ ] Optimistic updates

---

## 🔗 Related Files

- [`globals.css`](../src/app/globals.css) - Animations
- [`UI_UX_DESIGN_SYSTEM.md`](./UI_UX_DESIGN_SYSTEM.md) - Base design system
- [`FRONTEND_DEVELOPER_GUIDE.md`](./FRONTEND_DEVELOPER_GUIDE.md) - Developer guide

---

**Happy Coding! 🚀**
