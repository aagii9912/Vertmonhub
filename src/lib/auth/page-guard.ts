import { redirect } from 'next/navigation';
import { resolvePermissions } from '@/lib/auth/require-permission';

/**
 * Server component-д зориулсан модулийн хамгаалалт.
 *
 * Дашбордын хуудсууд эрхийг зөвхөн Sidebar-ийн client filter-ээр хязгаарлаж
 * байсан — цэснээс нуугдсан ч URL-ыг гараар бичвэл хуудас ачаалагддаг байв.
 * Өгөгдлийг API давхарга хамгаалж байгаа тул энэ нь хоёрдогч хамгаалалт
 * (defense-in-depth) боловч эмзэг хэсгүүдэд байх нь зөв.
 *
 * Хэрэглээ (server layout.tsx дотор):
 *   export default async function Layout({ children }) {
 *       await requirePageModule('finance');
 *       return <>{children}</>;
 *   }
 */
export async function requirePageModule(module: string): Promise<void> {
    const perm = await resolvePermissions();

    if (!perm) {
        redirect(`/auth/login?redirect_url=/dashboard`);
    }

    if (perm.role === 'super_admin') return;

    if (!perm.permissions.modules.includes(module)) {
        redirect('/dashboard?denied=' + encodeURIComponent(module));
    }
}
