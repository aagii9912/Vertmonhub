import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing/LandingNav';
import { Hero } from '@/components/landing/Hero';
import { ChatDemo } from '@/components/landing/ChatDemo';
import { Journey } from '@/components/landing/Journey';
import { Features } from '@/components/landing/Features';
import { SocialProof } from '@/components/landing/SocialProof';
import { FinalCTA } from '@/components/landing/FinalCTA';
import { LandingFooter } from '@/components/landing/LandingFooter';

const TITLE = 'Vertmon Hub — Үл хөдлөхийн AI борлуулалт ба CRM платформ';
const DESCRIPTION =
    'Facebook, Instagram Messenger дээр AI борлуулагч 24/7 хариулж, лийд цуглуулна. Уулзалт товлох, гэрээ хянах, санхүү, тайлан — бүгд нэг ухаалаг системд.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        type: 'website',
        locale: 'mn_MN',
        siteName: 'Vertmon Hub',
    },
    twitter: {
        card: 'summary_large_image',
        title: TITLE,
        description: DESCRIPTION,
    },
};

/**
 * Public landing page (Server Component).
 * Бүх interactive/animation хэсэг src/components/landing доорх 'use client'
 * дэд компонентууд дотор байрладаг — энэ хуудас зөвхөн тэдгээрийг угсарна.
 */
export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <LandingNav />
            <main>
                <Hero />
                <ChatDemo />
                <Journey />
                <Features />
                <SocialProof />
                <FinalCTA />
            </main>
            <LandingFooter />
        </div>
    );
}
