/**
 * Landing Page Content API
 * GET - Public: Returns landing page content
 * PUT - Admin only: Updates landing page content
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { defaultLandingContent } from '@/lib/landing/defaults';
import type { LandingContent } from '@/lib/landing/types';
import { getAuthUser } from '@/lib/auth/auth';
import { logger } from '@/lib/utils/logger';

// GET — Public, no auth required
export async function GET() {
    try {
        const supabase = supabaseAdmin();
        const { data, error } = await supabase
            .from('landing_content')
            .select('hero, metrics, features, how_it_works, social_proof, pricing, comparison, faq, cta, updated_at')
            .limit(1)
            .maybeSingle();

        if (error) {
            logger.error('[Landing Content API] GET error:', { error: error });
            return NextResponse.json(defaultLandingContent);
        }

        if (!data) {
            return NextResponse.json(defaultLandingContent);
        }

        // Merge DB data with defaults (DB fields override defaults)
        const content: LandingContent = {
            hero: data.hero && Object.keys(data.hero).length > 0 ? data.hero : defaultLandingContent.hero,
            metrics: data.metrics && data.metrics.length > 0 ? data.metrics : defaultLandingContent.metrics,
            features: data.features && Object.keys(data.features).length > 0 ? data.features : defaultLandingContent.features,
            how_it_works: data.how_it_works && Object.keys(data.how_it_works).length > 0 ? data.how_it_works : defaultLandingContent.how_it_works,
            social_proof: data.social_proof && Object.keys(data.social_proof).length > 0 ? data.social_proof : defaultLandingContent.social_proof,
            pricing: data.pricing && Object.keys(data.pricing).length > 0 ? data.pricing : defaultLandingContent.pricing,
            comparison: data.comparison && data.comparison.length > 0 ? data.comparison : defaultLandingContent.comparison,
            faq: data.faq && Object.keys(data.faq).length > 0 ? data.faq : defaultLandingContent.faq,
            cta: data.cta && Object.keys(data.cta).length > 0 ? data.cta : defaultLandingContent.cta,
        };

        return NextResponse.json(content);
    } catch (error: unknown) {
        logger.error('[Landing Content API] GET error:', { error: error });
        return NextResponse.json(defaultLandingContent);
    }
}

// PUT — Requires auth (shop owner or admin)
export async function PUT(request: NextRequest) {
    try {
        const userId = await getAuthUser();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { section, data } = body;

        if (!section || !data) {
            return NextResponse.json(
                { error: 'section and data are required' },
                { status: 400 }
            );
        }

        const validSections = ['hero', 'metrics', 'features', 'how_it_works', 'social_proof', 'pricing', 'comparison', 'faq', 'cta'];
        if (!validSections.includes(section)) {
            return NextResponse.json(
                { error: `Invalid section: ${section}. Valid: ${validSections.join(', ')}` },
                { status: 400 }
            );
        }

        const supabase = supabaseAdmin();

        // Check if row exists
        const { data: existing } = await supabase
            .from('landing_content')
            .select('id')
            .limit(1)
            .maybeSingle();

        const updatePayload: Record<string, any> = {
            [section]: data,
            updated_at: new Date().toISOString(),
            updated_by: userId,
        };

        if (existing) {
            // Update existing row
            const { error } = await supabase
                .from('landing_content')
                .update(updatePayload)
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            // Insert first row
            const { error } = await supabase
                .from('landing_content')
                .insert(updatePayload);

            if (error) throw error;
        }

        return NextResponse.json({ success: true, section });
    } catch (error: unknown) {
        logger.error('[Landing Content API] PUT error:', { error: error });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update' },
            { status: 500 }
        );
    }
}
