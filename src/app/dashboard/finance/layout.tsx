import { requirePageModule } from '@/lib/auth/page-guard';

/**
 * Server-side модулийн хамгаалалт. Өмнө нь эрх зөвхөн Sidebar-ийн client
 * filter-ээр хязгаарлагдаж байсан тул URL-ыг гараар бичвэл хуудас
 * ачаалагддаг байв.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
    await requirePageModule('finance');
    return <>{children}</>;
}
