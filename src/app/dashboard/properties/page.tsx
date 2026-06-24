import { redirect } from 'next/navigation';

// Мандалын нөөц нь property_units-д (блок харагдац) байгаа. Хуучин `properties`
// хүснэгтэд тулгуурласан жагсаалт хоосон болсон тул каноник блок харагдац руу
// чиглүүлнэ. (Шинэ нэгж нэмэх нь /dashboard/properties/new дээр хэвээр.)
export default function PropertiesPage() {
    redirect('/dashboard/properties/blocks');
}
