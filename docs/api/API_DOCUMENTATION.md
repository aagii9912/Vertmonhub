# Syncly API Documentation 📡

> Backend API endpoints-ийн бүрэн баримт бичиг

---

## 🔐 Authentication

Бүх `/api/dashboard/*` endpoints дээр authentication шаардлагатай.

### Headers

```http
x-shop-id: <shop_id>
```

`shop_id` нь `localStorage.getItem('smarthub_active_shop_id')` -аас авна.

---

## 📊 Dashboard APIs

### GET /api/dashboard/stats

Dashboard статистик авах.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| period | string | 'today' | 'today' \| 'week' \| 'month' |

**Response:**
```json
{
  "shop": { "id": "xxx", "name": "My Shop" },
  "stats": {
    "todayOrders": 5,
    "pendingOrders": 2,
    "totalRevenue": 150000,
    "totalCustomers": 42
  },
  "recentOrders": [...],
  "activeConversations": [...],
  "lowStockProducts": [...],
  "unansweredCount": 3
}
```

---

### GET /api/dashboard/products

Бүтээгдэхүүнүүдийн жагсаалт.

**Response:**
```json
{
  "products": [
    {
      "id": "uuid",
      "name": "Product Name",
      "description": "...",
      "price": 15000,
      "stock": 50,
      "reserved_stock": 5,
      "discount_percent": 10,
      "is_active": true,
      "type": "physical",
      "colors": ["red", "blue"],
      "sizes": ["S", "M", "L"],
      "images": ["url1", "url2"]
    }
  ]
}
```

---

### POST /api/dashboard/products

Шинэ бүтээгдэхүүн үүсгэх.

**Request Body:**
```json
{
  "name": "Product Name",
  "description": "Description",
  "price": 15000,
  "stock": 100,
  "type": "physical",
  "colors": ["red"],
  "sizes": ["M"],
  "is_active": true
}
```

**Response:**
```json
{
  "success": true,
  "product": { ... }
}
```

---

### PATCH /api/dashboard/products

Бүтээгдэхүүн шинэчлэх.

**Request Body:**
```json
{
  "id": "product-uuid",
  "price": 20000,
  "stock": 150
}
```

---

### DELETE /api/dashboard/products?id=xxx

Бүтээгдэхүүн устгах.

---

## 📦 Orders APIs

### GET /api/dashboard/orders

Захиалгуудын жагсаалт.

**Response:**
```json
{
  "orders": [
    {
      "id": "uuid",
      "status": "pending",
      "total_amount": 50000,
      "created_at": "2026-01-16T00:00:00Z",
      "customer": {
        "name": "Customer Name",
        "phone": "99112233"
      },
      "items": [
        {
          "quantity": 2,
          "unit_price": 25000,
          "product": { "name": "Product" }
        }
      ]
    }
  ]
}
```

---

### PATCH /api/dashboard/orders

Захиалгын төлөв шинэчлэх.

**Request Body:**
```json
{
  "orderId": "uuid",
  "status": "confirmed"
}
```

**Valid Status Values:**
- `pending` - Хүлээгдэж байна
- `confirmed` - Баталгаажсан
- `processing` - Бэлтгэж байна
- `shipped` - Хүргэлтэнд гарсан
- `delivered` - Хүргэгдсэн
- `cancelled` - Цуцалсан

---

## 👥 Customers APIs

### GET /api/dashboard/customers

Харилцагчдын жагсаалт (CRM).

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| search | string | Нэр, утасны дугаараар хайх |
| vip | boolean | VIP харилцагчид |

**Response:**
```json
{
  "customers": [
    {
      "id": "uuid",
      "name": "Customer Name",
      "phone": "99112233",
      "address": "UB, Mongolia",
      "total_orders": 5,
      "total_spent": 250000,
      "is_vip": true,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 42
}
```

---

## 📈 Reports APIs

### GET /api/dashboard/reports

Борлуулалтын тайлан.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| startDate | string | Эхлэх огноо (ISO format) |
| endDate | string | Дуусах огноо (ISO format) |

**Response:**
```json
{
  "summary": {
    "totalRevenue": 5000000,
    "totalOrders": 150,
    "averageOrderValue": 33333
  },
  "bestSellers": [
    { "name": "Product", "quantity": 50, "revenue": 750000 }
  ],
  "dailyStats": [
    { "date": "2026-01-15", "revenue": 100000, "orders": 5 }
  ]
}
```

---

## 📤 Export APIs

### GET /api/dashboard/export

Excel файл татах.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| type | string | 'products' \| 'orders' \| 'customers' |

**Response:** Excel file download (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

---

## 🏪 Shop APIs

### GET /api/shop/current

Одоогийн дэлгүүрийн мэдээлэл.

### GET /api/shop/list

Хэрэглэгчийн бүх дэлгүүрүүд.

### POST /api/setup-shop

Шинэ дэлгүүр үүсгэх.

**Request Body:**
```json
{
  "name": "My Shop",
  "phone": "99112233",
  "ownerName": "Owner Name"
}
```

---

## 💳 Payment APIs

### POST /api/payment/qpay/create

QPay invoice үүсгэх.

### GET /api/payment/qpay/check?invoiceId=xxx

Төлбөр шалгах.

---

## 🔔 Notification APIs

### POST /api/push/subscribe

Push notification бүртгүүлэх.

### POST /api/push/send

Push notification илгээх (Admin only).

---

## 🤖 AI APIs

### POST /api/chat

Messenger webhook (Facebook-аас дуудагдана).

### POST /api/ai-settings

AI тохиргоо хадгалах.

---

## ⚠️ Error Responses

Бүх алдаа дараах format-аар ирнэ:

```json
{
  "error": "Error message",
  "details": ["Validation error 1", "Validation error 2"]
}
```

**HTTP Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation failed) |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |
