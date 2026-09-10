import { redirect } from 'next/navigation';

/**
 * v1-ийн бүтэн хуудас форм → v2 түргэн бүртгэлийн sheet.
 * Хуучин линкүүд (⌘K, нэвтрэх урсгал) хэвээр ажиллана.
 */
export default function NewLeadRedirect() {
    redirect('/dashboard/leads?new=1');
}
