import { expect, it } from 'vitest';
import { newsletterHtml, NewsletterActionSchema, NewsletterDesignSchema, defaultNewsletterDesign } from '../newsletter';

it('escapes content while retaining exactly one provider unsubscribe token', () => {
    const html = newsletterHtml('<img src=x>', 'Сайн байна уу\n{{{SECRET}}}<script>bad</script>');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img'); expect(html).not.toContain('{{{SECRET}}}');
    expect(html).toContain('Сайн байна уу<br>');
    expect(html.match(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g)).toHaveLength(1);
});
it('renders both branded layouts safely with images, CTA, preheader and one unsubscribe link', () => {
    for (const layout of ['newsletter', 'announcement'] as const) {
        const design = { ...defaultNewsletterDesign('Төсөл <script>'), layout, preheader: 'Шинэ мэдээ',
            imageUrl: 'https://example.com/photo.jpg', imageAlt: 'Зураг "тайлбар"', logoUrl: 'https://example.com/logo.png',
            buttonText: 'Дэлгэрэнгүй', buttonUrl: 'https://example.com/?a=1&b=2', footer: '{{{SECRET}}}' };
        const html = newsletterHtml('Гарчиг', 'Агуулга', design);
        expect(html).toContain('https://example.com/photo.jpg');
        expect(html).toContain('https://example.com/logo.png');
        expect(html).toContain('https://example.com/?a=1&amp;b=2');
        expect(html).toContain('Зураг &quot;тайлбар&quot;');
        expect(html).toContain('Шинэ мэдээ');
        expect(html).not.toContain('<script>'); expect(html).not.toContain('{{{SECRET}}}');
        expect(html.match(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g)).toHaveLength(1);
        expect(html).toContain('name="viewport"');
    }
    expect(newsletterHtml('Гарчиг', 'Агуулга', null)).toBe(newsletterHtml('Гарчиг', 'Агуулга'));
});
it('rejects unsafe URLs and incomplete buttons, including when pasted into a preview', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'http://example.com', 'https://user:pass@example.com']) {
        for (const field of ['logoUrl', 'imageUrl', 'buttonUrl'] as const) {
            const design = { ...defaultNewsletterDesign(), [field]: url };
            expect(NewsletterDesignSchema.safeParse(design).success).toBe(false);
            expect(newsletterHtml('Title', 'Body', design)).not.toContain(url);
        }
    }
    expect(NewsletterDesignSchema.safeParse({ ...defaultNewsletterDesign(), buttonText: 'Нээх' }).success).toBe(false);
    expect(NewsletterDesignSchema.safeParse({ ...defaultNewsletterDesign(), buttonUrl: 'https://example.com' }).success).toBe(false);
});
it('requires explicit consent and send confirmation', () => {
    expect(NewsletterActionSchema.safeParse({ action: 'subscribe', email: 'a@example.com', consent: false }).success).toBe(false);
    expect(NewsletterActionSchema.safeParse({ action: 'send', id: '00000000-0000-4000-8000-000000000001' }).success).toBe(false);

});
