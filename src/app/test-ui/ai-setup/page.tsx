'use client';

import { AISetupStep } from '@/components/setup/AISetupStep';
import { useEffect } from 'react';

export default function TestAISetupPage() {
    // Mock fetch to simulate Facebook API response
    useEffect(() => {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const url = args[0].toString();
            if (url.includes('graph.facebook.com')) {
                return new Response(JSON.stringify({
                    about: 'Бид хамгийн амттай, шинэхэн бургер хийдэг.',
                    description: 'Түргэн хоолны сүлжээ ресторан.',
                    mission: 'Хүн бүрт баяр баясгалан бэлэглэх.',
                    location: { city: 'Ulaanbaatar', country: 'Mongolia' }
                }));
            }
            return originalFetch(...args);
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full bg-[#0F0B2E] rounded-3xl p-8 shadow-xl">
                <AISetupStep
                    initialData={{
                        description: '',
                        ai_emotion: '',
                        ai_instructions: ''
                    }}
                    onSkip={() => alert('Skip clicked')}
                    onSave={async (data) => alert('Save clicked: ' + JSON.stringify(data))}
                    // Mock FB data to test the button appearance
                    fbPageId="mock-id"
                    fbPageToken="mock-token"
                />
            </div>
        </div>
    );
}
