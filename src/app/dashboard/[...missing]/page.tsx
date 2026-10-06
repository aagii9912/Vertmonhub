import { notFound } from 'next/navigation';

/**
 * Танигдаагүй дэд замыг (жишээ: хуучин холбоос) shell дотор 404 болгоно — эс бөгөөс
 * Next нийтийн 404-ийг shell-гүй харуулдаг. Тодорхой (static) замууд үүнээс түрүүлнэ.
 */
export default function MissingPage() {
    notFound();
}
