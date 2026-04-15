/**
 * Property Types for Vertmon Hub Real Estate Platform
 */

// Property type enum
export type PropertyType = 'apartment' | 'house' | 'office' | 'land' | 'commercial';

// Property status enum
export type PropertyStatus = 'available' | 'reserved' | 'sold' | 'rented' | 'barter';

// Lead status enum
export type LeadStatus = 'new' | 'contacted' | 'viewing_scheduled' | 'offered' | 'negotiating' | 'closed_won' | 'closed_lost';

// Lead source
export type LeadSource = 'messenger' | 'instagram' | 'website' | 'referral' | 'phone' | 'other';

/**
 * Property Interface
 */
export interface Property {
    id: string;
    shop_id: string;

    // Basic Info
    name: string;
    description: string | null;
    type: PropertyType;

    // Pricing
    price: number;
    price_per_sqm: number | null;
    currency: string;

    // Specifications
    size_sqm: number | null;
    rooms: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    floor: string | null;
    year_built: number | null;

    // Location
    address: string | null;
    district: string | null;
    city: string;
    location_lat: number | null;
    location_lng: number | null;

    // Status
    status: PropertyStatus;
    is_active: boolean;
    is_featured: boolean;

    // Media
    images: string[];
    video_url: string | null;
    virtual_tour_url: string | null;

    // Features
    features: string[];
    amenities: string[];

    // Meta
    views_count: number;
    inquiries_count: number;

    // Timestamps
    created_at: string;
    updated_at: string;
}

/**
 * Lead Interface (Real Estate CRM)
 */
export interface Lead {
    id: string;
    shop_id: string;
    customer_id: string | null;
    property_id: string | null;

    // Lead Info
    status: LeadStatus;
    source: LeadSource;

    // Customer Info
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;

    // Requirements
    budget_min: number | null;
    budget_max: number | null;
    preferred_type: PropertyType | null;
    preferred_district: string | null;
    preferred_rooms: number | null;
    preferred_size_min: number | null;
    preferred_size_max: number | null;

    // Timeline
    move_in_date: string | null;
    urgency: 'urgent' | 'normal' | 'flexible';

    // CRM Integration
    hubspot_deal_id: string | null;
    hubspot_contact_id: string | null;

    // Activity
    last_contact_at: string | null;
    next_followup_at: string | null;
    viewing_scheduled_at: string | null;

    // Notes
    notes: string | null;
    internal_notes: string | null;

    // Assignment
    assigned_to: string | null;

    // Conversion
    converted_at: string | null;
    conversion_value: number | null;

    // Timestamps
    created_at: string;
    updated_at: string;
}

/**
 * Property Viewing Interface
 */
export interface PropertyViewing {
    id: string;
    lead_id: string | null;
    property_id: string;

    // Scheduling
    scheduled_at: string;
    duration_minutes: number;

    // Status
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';

    // Feedback
    customer_feedback: string | null;
    agent_notes: string | null;
    interest_level: number | null;

    // Timestamps
    created_at: string;
    completed_at: string | null;
}

/**
 * Property Search Filters
 */
export interface PropertySearchFilters {
    type?: PropertyType;
    status?: PropertyStatus;
    min_price?: number;
    max_price?: number;
    min_size?: number;
    max_size?: number;
    rooms?: number;
    district?: string;
    city?: string;
    is_featured?: boolean;
}

/**
 * Loan Calculator Input
 */
export interface LoanCalculatorInput {
    amount: number;      // Principal amount
    rate: number;        // Annual interest rate (%)
    years: number;       // Loan term in years
}

/**
 * Loan Calculator Result
 */
export interface LoanCalculatorResult {
    monthly_payment: number;
    total_payment: number;
    total_interest: number;
    principal: number;
}

/**
 * Property Contract — Excel-ээс импортолсон гэрээний бүх өгөгдөл
 * (Mongolian sales-tracking workbook structure)
 */
export type ContractStatus = 'active' | 'closed' | 'cancelled';

export interface PropertyContract {
    id: string;
    shop_id: string;

    // Бүтээгдэхүүн / орон сууц
    product_type: string;            // residential, parking, industry, commercial
    block_name: string | null;
    building_number: string | null;
    floor: string | null;
    unit_number: string | null;      // Шинэ тоот
    legacy_unit_number: string | null; // Тоот (хуучин)
    unit_label: string | null;       // Сууцны тэмдэглэгээ (4a)
    unit_type: string | null;        // Айлын төрөл (G)
    model: string | null;            // Загвар (4B)
    rooms: number | null;
    contracted_area: number | null;

    // Үнэ
    first_price: number | null;
    price_per_sqm: number | null;
    total_price: number | null;

    // Урьдчилгаа
    prepayment_condition: string | null;
    prepayment_percent: number | null;
    prepayment_due: number | null;
    prepayment_paid: number | null;
    prepayment_paid_cash: number | null;
    prepayment_paid_barter: number | null;

    // Төлбөрийн нийт байдал
    paid_amount: number | null;
    paid_percent: number | null;
    balance: number | null;
    penalty_amount: number | null;
    overdue_days: number | null;

    // Гэрээ
    contract_number: string | null;
    contract_date: string | null;
    contract_status: ContractStatus;
    payment_condition: string | null;
    remaining_payment_condition: string | null;

    // Борлуулалт
    sales_channel: string | null;
    sales_manager: string | null;
    bank_status: string | null;
    barter_status: string | null;
    barter_type: string | null;
    balance_payment_method: string | null;

    // Худалдан авагч
    customer_name: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    customer_registration: string | null;
    customer_phone: string | null;
    customer_mobile: string | null;

    // Огноо
    order_date: string | null;
    commissioning_date: string | null;

    // CRM
    hubspot_contact_id: string | null;

    // Timestamps
    created_at: string;
    updated_at: string;
}

/**
 * Гэрээний жагсаалтын статистик
 */
export interface ContractStats {
    total: number;
    closed: number;
    active: number;
    total_sales: number;
    total_paid: number;
    total_balance: number;
    overdue_count: number;
}
