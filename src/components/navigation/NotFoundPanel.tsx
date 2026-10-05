import { Button } from '@/components/ui/Button';

/**
 * «Хуудас олдсонгүй» — нийтийн 404 болон ажлын shell доторх 404 хоёулаа ашиглана.
 * Server component (state, effect байхгүй).
 */
export function NotFoundPanel({ inApp = false }: { inApp?: boolean }) {
    return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <p className="num text-sm font-medium text-muted-foreground">404</p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Хуудас олдсонгүй</h1>
            <p className="text-sm text-muted-foreground">
                {inApp
                    ? 'Энэ хаяг буруу эсвэл хуудас зөөгдсөн байна. Цэс эсвэл ⌘K хайлтаас хүссэн хуудсаа олоорой.'
                    : 'Таны хайсан хуудас байхгүй эсвэл зөөгдсөн байна.'}
            </p>
            <div className="mt-3 flex items-center gap-2">
                {inApp ? (
                    <Button href="/dashboard">Өнөөдөр руу буцах</Button>
                ) : (
                    <>
                        <Button href="/" variant="secondary">Нүүр хуудас</Button>
                        <Button href="/dashboard">Нэвтрэх</Button>
                    </>
                )}
            </div>
        </div>
    );
}
