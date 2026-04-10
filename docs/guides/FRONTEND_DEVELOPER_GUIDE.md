# SmartHub Frontend Developer Guide 🚀

> **Front-end developer-д зориулсан бүрэн гарын авлага**

---

## 📋 Товч танилцуулга

**SmartHub** бол жижиг, дунд бизнесүүдэд зориулсан AI-тэй нэгдсэн борлуулалтын туслах систем. Facebook Messenger-ээр автоматаар захиалга авч, харилцагчтай харилцаж, борлуулалтын статистикийг харуулдаг.

---

## 🛠️ Tech Stack

| Технологи | Хувилбар | Зориулалт |
|-----------|----------|-----------|
| **Next.js** | 16.1.1 | React framework (App Router) |
| **React** | 19.2.3 | UI library |
| **TypeScript** | 5.x | Type safety |
| **Tailwind CSS** | 4.x | Styling |
| **TanStack Query** | 5.x | Data fetching & caching |
| **Supabase** | Latest | PostgreSQL database |
| **Clerk** | 6.x | Authentication |
| **Lucide React** | Latest | Icons |
| **Recharts** | 3.x | Charts |

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: >= 18.17.0
- **npm**: Latest version

### 2. Installation

```bash
# Clone repository
git clone <repo-url>
cd smarthub

# Install dependencies
npm install

# Copy environment file
cp .env.production.example .env.local
# .env.local файлд өөрийн API keys оруулна
```

### 3. Environment Variables

`.env.local` файлд дараах variables шаардлагатай:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key
CLERK_SECRET_KEY=your_clerk_secret

# Facebook
FACEBOOK_PAGE_ACCESS_TOKEN=your_token
FACEBOOK_VERIFY_TOKEN=your_verify_token
FACEBOOK_APP_SECRET=your_app_secret

# AI
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
```

### 4. Run Development Server

```bash
npm run dev
```

App: [http://localhost:3001](http://localhost:3001)

---

## 📁 Project Structure

```
smarthub/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API Routes (Backend)
│   │   │   ├── dashboard/     # Dashboard APIs
│   │   │   │   ├── stats/     # GET /api/dashboard/stats
│   │   │   │   ├── products/  # CRUD /api/dashboard/products
│   │   │   │   ├── orders/    # CRUD /api/dashboard/orders
│   │   │   │   ├── customers/ # GET /api/dashboard/customers
│   │   │   │   ├── reports/   # GET /api/dashboard/reports
│   │   │   │   └── export/    # GET /api/dashboard/export
│   │   │   ├── auth/          # Authentication endpoints
│   │   │   ├── chat/          # Messenger webhook
│   │   │   ├── payment/       # QPay integration
│   │   │   ├── subscription/  # Subscription management
│   │   │   └── webhook/       # External webhooks
│   │   ├── dashboard/         # Dashboard Pages
│   │   │   ├── page.tsx       # Main dashboard
│   │   │   ├── products/      # Products page
│   │   │   ├── orders/        # Orders page
│   │   │   ├── customers/     # CRM page
│   │   │   ├── reports/       # Reports page
│   │   │   ├── marketing/     # Marketing page
│   │   │   ├── ai-settings/   # AI settings
│   │   │   ├── settings/      # Shop settings
│   │   │   └── subscription/  # Subscription page
│   │   ├── admin/             # Admin pages
│   │   ├── auth/              # Auth pages (signin, etc)
│   │   ├── setup/             # Shop setup wizard
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Landing page
│   │
│   ├── components/            # React Components
│   │   ├── dashboard/         # Dashboard-specific
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MobileNav.tsx
│   │   │   ├── ShopSwitcher.tsx
│   │   │   ├── StatsCard.tsx
│   │   │   ├── ActionCenter.tsx
│   │   │   ├── SmartInsights.tsx
│   │   │   ├── SalesChart.tsx
│   │   │   ├── BestSellersTable.tsx
│   │   │   └── RevenueStats.tsx
│   │   ├── ui/                # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── LoadingSkeleton.tsx
│   │   │   └── PullToRefresh.tsx
│   │   ├── setup/             # Setup wizard components
│   │   └── providers/         # Context providers
│   │
│   ├── hooks/                 # Custom React Hooks
│   │   ├── useDashboard.ts    # Dashboard data
│   │   ├── useProducts.ts     # Products CRUD
│   │   ├── useOrders.ts       # Orders data
│   │   ├── useReports.ts      # Reports data
│   │   ├── useUpdateOrder.ts  # Order mutations
│   │   ├── usePushNotifications.ts
│   │   └── use-mobile.ts      # Mobile detection
│   │
│   ├── lib/                   # Utilities & Services
│   │   ├── ai/                # AI integrations
│   │   ├── auth/              # Auth utilities
│   │   ├── facebook/          # Facebook API
│   │   ├── payment/           # QPay integration
│   │   ├── email/             # Email service
│   │   ├── utils/             # Helper functions
│   │   ├── validations/       # Zod schemas
│   │   ├── supabase.ts        # Supabase client
│   │   └── notifications.ts   # Push notifications
│   │
│   ├── contexts/              # React Contexts
│   │   └── ShopContext.tsx    # Active shop context
│   │
│   ├── types/                 # TypeScript Types
│   │   └── database.ts        # Database types
│   │
│   └── middleware.ts          # Next.js middleware
│
├── supabase/
│   └── migrations/            # SQL migrations
│
├── public/                    # Static assets
│   ├── icons/
│   └── manifest.json          # PWA manifest
│
└── docs/                      # Documentation
```

---

## 🎨 Design System

### Color Palette

CSS Variables (`globals.css`):

```css
/* Light Mode */
--background: #ffffff;
--foreground: #0f172a;
--primary: #4f46e5;        /* Indigo 600 */
--secondary: #f1f5f9;      /* Slate 100 */
--muted: #f8fafc;          /* Slate 50 */
--destructive: #ef4444;    /* Red 500 */
--success: #10b981;        /* Emerald 500 */
--border: #e2e8f0;         /* Slate 200 */

/* Dark Mode (prefers-color-scheme: dark) */
--background: #030712;
--foreground: #f8fafc;
--primary: #6366f1;        /* Indigo 500 */
```

### Typography

- **Font Family**: Geist Sans (--font-sans)
- **Font Mono**: Geist Mono (--font-mono)

### Border Radius

```css
--radius: 1rem;
--radius-sm: calc(var(--radius) - 4px);
--radius-md: calc(var(--radius) - 2px);
--radius-lg: var(--radius);
```

### Glassmorphism

```css
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}
```

---

## 🧩 UI Components

### Button Component

**Location**: `src/components/ui/Button.tsx`

```tsx
import { Button } from '@/components/ui/Button';

// Variants
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="danger">Danger</Button>
<Button variant="ghost">Ghost</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// Loading state
<Button isLoading>Loading...</Button>
```

**Props**:
| Prop | Type | Default |
|------|------|---------|
| variant | 'primary' \| 'secondary' \| 'danger' \| 'ghost' | 'primary' |
| size | 'sm' \| 'md' \| 'lg' | 'md' |
| isLoading | boolean | false |

---

### Card Component

**Location**: `src/components/ui/Card.tsx`

```tsx
import { Card } from '@/components/ui/Card';

<Card>
  <h3>Card Title</h3>
  <p>Card content</p>
</Card>

<Card className="p-6">
  Custom padding
</Card>
```

---

### Badge Component

**Location**: `src/components/ui/Badge.tsx`

```tsx
import { Badge } from '@/components/ui/Badge';

<Badge variant="default">Default</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="danger">Danger</Badge>
```

---

### DataTable Component

**Location**: `src/components/ui/DataTable.tsx`

TanStack Table-тэй нэгдсэн, sorting, filtering, pagination-тай.

```tsx
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDef } from '@tanstack/react-table';

const columns: ColumnDef<Product>[] = [
  { accessorKey: 'name', header: 'Нэр' },
  { accessorKey: 'price', header: 'Үнэ' },
];

<DataTable 
  columns={columns} 
  data={products} 
  searchable={true}
  searchKey="name"
/>
```

---

## 🎣 Custom Hooks

### useDashboard

Dashboard статистик татах:

```tsx
import { useDashboard } from '@/hooks/useDashboard';

function DashboardPage() {
  const { data, isLoading, error } = useDashboard('today');
  // 'today' | 'week' | 'month'
  
  if (isLoading) return <LoadingSkeleton />;
  
  return (
    <div>
      <p>Өнөөдрийн захиалга: {data?.stats.todayOrders}</p>
      <p>Нийт орлого: {data?.stats.totalRevenue}₮</p>
    </div>
  );
}
```

**Return Type**:
```ts
interface DashboardData {
  stats: {
    todayOrders: number;
    pendingOrders: number;
    totalRevenue: number;
    totalCustomers: number;
  };
  recentOrders: Order[];
  activeConversations: Conversation[];
  lowStockProducts: Product[];
  unansweredCount: number;
}
```

---

### useProducts

Products CRUD:

```tsx
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/useProducts';

function ProductsPage() {
  // Fetch all products
  const { data: products, isLoading } = useProducts();
  
  // Create product
  const createMutation = useCreateProduct();
  const handleCreate = () => {
    createMutation.mutate({
      name: 'New Product',
      price: 10000,
      stock: 100,
      type: 'physical',
    });
  };
  
  // Update product
  const updateMutation = useUpdateProduct();
  const handleUpdate = (id: string) => {
    updateMutation.mutate({ id, price: 15000 });
  };
  
  // Delete product
  const deleteMutation = useDeleteProduct();
  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };
}
```

---

### useOrders

```tsx
import { useOrders } from '@/hooks/useOrders';

const { data: orders, isLoading } = useOrders();
```

---

### useUpdateOrder

Order status шинэчлэх:

```tsx
import { useUpdateOrder } from '@/hooks/useUpdateOrder';

const updateOrder = useUpdateOrder();

updateOrder.mutate({
  orderId: 'xxx',
  status: 'confirmed', // 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
});
```

---

## 📡 API Endpoints

> **Note**: Бүх API дуудлагад `x-shop-id` header шаардлагатай (localStorage-аас авна).

### Dashboard APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats?period=today` | Dashboard statistics |
| GET | `/api/dashboard/products` | List products |
| POST | `/api/dashboard/products` | Create product |
| PATCH | `/api/dashboard/products` | Update product |
| DELETE | `/api/dashboard/products?id=xxx` | Delete product |
| GET | `/api/dashboard/orders` | List orders |
| PATCH | `/api/dashboard/orders` | Update order status |
| GET | `/api/dashboard/customers` | List customers |
| GET | `/api/dashboard/reports` | Sales reports |
| GET | `/api/dashboard/export?type=products` | Export to Excel |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/facebook` | Facebook login |
| POST | `/api/auth/link-facebook` | Link Facebook page |

### Shop Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shop/current` | Get current shop |
| GET | `/api/shop/list` | List user's shops |
| POST | `/api/setup-shop` | Create new shop |

---

## 📊 TypeScript Types

**Location**: `src/types/database.ts`

```typescript
// Shop
interface Shop {
  id: string;
  name: string;
  facebook_page_id: string | null;
  owner_name: string | null;
  phone: string | null;
  created_at: string;
}

// Product
interface Product {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  type: 'physical' | 'service' | 'appointment';
  colors: string[];
  sizes: string[];
  images: string[];
  discount_percent: number | null;
  // Appointment fields
  duration_minutes: number | null;
  available_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  max_bookings_per_day: number | null;
  created_at: string;
}

// Customer
interface Customer {
  id: string;
  shop_id: string;
  facebook_id: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  total_orders: number;
  total_spent: number;
  is_vip: boolean;
  created_at: string;
}

// Order
type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

interface Order {
  id: string;
  shop_id: string;
  customer_id: string;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  customer?: Customer;
  items?: OrderItem[];
}

// Order Item
interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  product?: Product;
}
```

---

## 🔐 Authentication

Clerk authentication ашиглаж байна.

### Protected Routes

`src/middleware.ts` дээр тодорхойлсон:
- `/dashboard/*` - Login шаардлагатай
- `/admin/*` - Admin role шаардлагатай
- `/api/dashboard/*` - Auth header шаардлагатай

### Getting Current User Shop

```tsx
// Server-side (API routes)
import { getClerkUserShop } from '@/lib/auth/clerk-auth';

export async function GET() {
  const shop = await getClerkUserShop();
  if (!shop) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // shop.id, shop.name available
}

// Client-side
// x-shop-id header-ээр дамжуулна
const shopId = localStorage.getItem('smarthub_active_shop_id');
```

---

## 📱 Mobile Optimization

### Touch Targets

```css
/* Minimum 44x44px for accessibility */
.touch-target { min-width: 44px; min-height: 44px; }
.touch-target-lg { min-width: 48px; min-height: 48px; }
```

### Safe Areas (Notched Devices)

```css
.pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 1rem); }
.pt-safe { padding-top: max(env(safe-area-inset-top), 1rem); }
```

### Mobile Detection Hook

```tsx
import { useMobile } from '@/hooks/use-mobile';

function Component() {
  const isMobile = useMobile();
  
  return isMobile ? <MobileView /> : <DesktopView />;
}
```

---

## 🔄 State Management

### TanStack Query

Data fetching & caching-д TanStack Query ашиглана:

```tsx
// Provider (layout.tsx-д бэлэн)
import { QueryProvider } from '@/components/providers/QueryProvider';

// Usage
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['products'],
  queryFn: fetchProducts,
});

// Mutations
const mutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  },
});
```

### Shop Context

Active shop-ийг context-оор дамжуулна:

```tsx
import { useShop } from '@/contexts/ShopContext';

function Component() {
  const { activeShop, setActiveShop, shops } = useShop();
}
```

---

## 📂 Important Files

| File | Description |
|------|-------------|
| `src/app/layout.tsx` | Root layout (providers) |
| `src/app/globals.css` | Global styles & design tokens |
| `src/app/dashboard/layout.tsx` | Dashboard layout (sidebar, header) |
| `src/middleware.ts` | Route protection |
| `src/lib/supabase.ts` | Supabase client |
| `src/types/database.ts` | All TypeScript types |

---

## 🚨 Common Patterns

### API Call Pattern

```tsx
// hooks/useXxx.ts
export function useXxx() {
  return useQuery({
    queryKey: ['xxx'],
    queryFn: async () => {
      const res = await fetch('/api/xxx', {
        headers: {
          'x-shop-id': localStorage.getItem('smarthub_active_shop_id') || ''
        }
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });
}
```

### Loading States

```tsx
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

if (isLoading) return <LoadingSkeleton type="card" count={3} />;
```

### Error Handling

```tsx
if (error) {
  return (
    <div className="text-destructive p-4">
      Алдаа гарлаа: {error.message}
    </div>
  );
}
```

---

## 📞 Support

Асуулт байвал project owner-т хандана уу!

---

**Happy Coding! 🎉**
