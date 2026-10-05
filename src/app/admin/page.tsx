import { redirect } from 'next/navigation';

/** `/admin` → Тойм. Нэвтрэлт, эрхийг proxy болон `admin/layout.tsx` шалгана. */
export default function AdminIndexPage() {
    redirect('/admin/dashboard');
}
