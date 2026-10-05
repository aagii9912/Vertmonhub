import { headers } from 'next/headers';
import { getUserId, getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { intakeProjectName, pageOrigin } from '@/lib/leads/intake-project';
import { ContactForm } from './ContactForm';

export const dynamic = 'force-dynamic';

/**
 * Толгойн төслийн нэрийг POST /api/leads лидийг холбох эх сурвалжаас авна:
 * нэвтэрсэн ажилтан → түүний shop-ийн төсөл, олон нийт → сайтын тохиргоо
 * (LEAD_PROJECT_ORIGINS / LEAD_PROJECT_ID). Түргэн бүртгэлийн горимыг POST-ийн
 * ажилтны шалгалттай ижил эрхээр (лид модуль + бичих) л нээнэ.
 */
async function resolveContactContext(): Promise<{ projectName: string | null; canQuickEntry: boolean }> {
    let staffShopId: string | null = null;
    let canQuickEntry = false;
    try {
        if (await getUserId()) {
            const [shop, access] = await Promise.all([getUserShop(), resolvePermissions()]);
            staffShopId = shop?.id ?? null;
            canQuickEntry = !!access && (access.role === 'super_admin'
                || (access.permissions.modules.includes('leads') && access.permissions.canWrite));
        }
    } catch {
        // Нэвтрэлт шалгаж чадаагүй бол олон нийтийн маягтаар үргэлжилнэ.
    }

    let projectName: string | null = null;
    try {
        projectName = await intakeProjectName(supabaseAdmin(), pageOrigin(await headers()), staffShopId);
    } catch {
        projectName = null;
    }
    return { projectName, canQuickEntry };
}

export default async function ContactPage() {
    const { projectName, canQuickEntry } = await resolveContactContext();
    return <ContactForm projectName={projectName} canQuickEntry={canQuickEntry} />;
}
