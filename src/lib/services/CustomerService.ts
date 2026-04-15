/**
 * CustomerService - Handles customer-related database operations
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { DatabaseError, NotFoundError } from '@/types/errors';
import type { Customer } from '@/types/database';

export interface CreateCustomerData {
    shopId: string;
    facebookId: string;
    name?: string | null;
    phone?: string | null;
    address?: string | null;
}

export interface UpdateCustomerData {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
}

export class CustomerService {
    private supabase = supabaseAdmin();

    /**
     * Get customer by ID
     */
    async getById(id: string): Promise<Customer | null> {
        const { data, error } = await this.supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get customer', { id, error });
            throw new DatabaseError('Failed to get customer', { id });
        }

        return data;
    }

    /**
     * Get customer by Facebook ID for a specific shop
     */
    async getByFacebookId(facebookId: string, shopId: string): Promise<Customer | null> {
        const { data, error } = await this.supabase
            .from('customers')
            .select('*')
            .eq('facebook_id', facebookId)
            .eq('shop_id', shopId)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get customer by Facebook ID', { facebookId, shopId, error });
            throw new DatabaseError('Failed to get customer', { facebookId, shopId });
        }

        return data;
    }

    /**
     * Get or create customer - used during webhook processing
     */
    async getOrCreate(data: CreateCustomerData): Promise<Customer> {
        // Try to find existing customer
        const customer = await this.getByFacebookId(data.facebookId, data.shopId);

        if (customer) {
            return customer;
        }

        // Create new customer
        const { data: newCustomer, error } = await this.supabase
            .from('customers')
            .insert({
                shop_id: data.shopId,
                facebook_id: data.facebookId,
                name: data.name,
                phone: data.phone,
                address: data.address,
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create customer', { data, error });
            throw new DatabaseError('Failed to create customer', { facebookId: data.facebookId });
        }

        logger.info('Created new customer', { customerId: newCustomer.id, facebookId: data.facebookId });
        return newCustomer;
    }

    /**
     * Update customer data
     */
    async update(id: string, data: UpdateCustomerData): Promise<Customer> {
        const { data: updated, error } = await this.supabase
            .from('customers')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update customer', { id, data, error });
            throw new DatabaseError('Failed to update customer', { id });
        }

        if (!updated) {
            throw new NotFoundError('Customer', id);
        }

        return updated;
    }

    /**
     * Update customer from Facebook profile
     */
    async updateFromFacebook(
        customerId: string,
        pageAccessToken: string,
        facebookId: string
    ): Promise<Customer | null> {
        try {
            const profileResponse = await fetch(
                `https://graph.facebook.com/${facebookId}?fields=first_name,last_name,name&access_token=${pageAccessToken}`
            );

            if (!profileResponse.ok) {
                logger.warn('Could not fetch Facebook profile', { facebookId });
                return null;
            }

            const profileData = await profileResponse.json();
            const userName = profileData.name || profileData.first_name || null;

            if (userName) {
                return this.update(customerId, { name: userName });
            }

            return null;
        } catch (error) {
            logger.warn('Error fetching Facebook profile', { facebookId, error });
            return null;
        }
    }

    /**
     * Extract phone number from message and update customer
     */
    async extractAndUpdatePhone(customerId: string, message: string): Promise<string | null> {
        const phoneMatch = message.match(/(\d{8})/);

        if (phoneMatch) {
            const phone = phoneMatch[1];
            await this.update(customerId, { phone });
            logger.info('Phone extracted from message', { phone, customerId });
            return phone;
        }

        return null;
    }

    /**
     * Get customers for a shop with pagination
     */
    async getByShop(
        shopId: string,
        options?: { limit?: number; offset?: number; orderBy?: string }
    ): Promise<Customer[]> {
        let query = this.supabase
            .from('customers')
            .select('*')
            .eq('shop_id', shopId);

        if (options?.orderBy) {
            query = query.order(options.orderBy, { ascending: false });
        } else {
            query = query.order('created_at', { ascending: false });
        }

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        const { data, error } = await query;

        if (error) {
            logger.error('Failed to get customers', { shopId, error });
            throw new DatabaseError('Failed to get customers', { shopId });
        }

        return data || [];
    }

}

// Export singleton instance
export const customerService = new CustomerService();
