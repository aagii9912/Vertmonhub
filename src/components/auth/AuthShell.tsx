import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BrandLogo } from './BrandLogo';

interface AuthShellProps {
    /** Картын слот — ихэвчлэн `<AuthCard>`. */
    children: ReactNode;
    /** Доод хэсэгт харагдах холбоос/тусламжийн талбар (нэвтрэх↔бүртгүүлэх г.м.). */
    footer?: ReactNode;
    /** Логоны баруун талд (дээд эгнээнд) харагдах туслах хэсэг — жишээ нь хэл сонгогч. */
    topRight?: ReactNode;
    className?: string;
}

/**
 * AuthShell — auth хуудсуудын нэгдсэн хүрээ (chrome).
 *
 * `bg-background` дээр голлуулсан, responsive, safe-area-г хүндэтгэсэн босоо
 * төвлөрсөн layout. Дээр нь BrandLogo, доор нь AuthCard слот + сонголтоор footer.
 */
export function AuthShell({ children, footer, topRight, className }: AuthShellProps) {
    return (
        <div
            className={cn(
                'flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12',
                'pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]',
                className,
            )}
        >
            <div className="w-full max-w-md">
                {topRight ? <div className="mb-4 flex justify-end">{topRight}</div> : null}

                <div className="mb-8 flex justify-center">
                    <BrandLogo size="md" variant="stacked" />
                </div>

                {children}

                {footer ? <div className="mt-6 text-center">{footer}</div> : null}
            </div>
        </div>
    );
}

export default AuthShell;
