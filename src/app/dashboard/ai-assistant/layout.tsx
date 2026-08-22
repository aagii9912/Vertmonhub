'use client';

export default function AIAssistantLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        // ЗАСВАР: өмнө нь h-[calc(100vh-var(--header-h))] байсан тул мобайл доод
        // навигацийн 88px-ийн ард бичих талбар бүрэн дарагдаж, AI чат утсан дээр
        // ашиглах боломжгүй байв. Одоо --mobilenav-h-г хасна (md-ээс дээш 0).
        // 100dvh — хөтчийн хаягийн мөр нуугдах/гарахад өндөр зөв тохирно.
        <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100dvh-var(--header-h)-var(--mobilenav-h))] overflow-hidden">
            {children}
        </div>
    );
}
