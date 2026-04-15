export interface Shop {
    id: string;
    name: string;
    facebook_page_id: string | null;
    facebook_page_name?: string | null;
    owner_name: string | null;
    phone: string | null;
    created_at: string;
    is_active?: boolean;
    // Bank information
    bank_name?: string | null;
    account_number?: string | null;
    account_name?: string | null;
    // Instagram Integration
    instagram_business_account_id?: string | null;
    instagram_access_token?: string | null;
    instagram_username?: string | null;
}

export interface Customer {
    id: string;
    shop_id: string;
    facebook_id: string | null;
    name: string | null;
    phone: string | null;
    email?: string | null;
    address: string | null;
    notes?: string | null;
    tags?: string[];
    message_count?: number;
    last_contact_at?: string | null;
    created_at: string;
}

export interface ChatHistory {
    id: string;
    shop_id: string;
    customer_id: string;
    message: string;
    response: string;
    created_at: string;
}

// Dashboard Stats (real estate)
export interface DashboardStats {
    totalProperties: number;
    totalLeads: number;
    monthlyViewings: number;
    pendingContracts: number;
}
