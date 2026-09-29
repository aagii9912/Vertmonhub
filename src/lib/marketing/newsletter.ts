import { z } from 'zod';

const optionalHttpsUrl = z.union([z.literal(''), z.url().max(2000).refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
}, 'https:// холбоос оруулна уу.')]);
export const NewsletterDesignSchema = z.object({
    layout: z.enum(['newsletter', 'announcement']),
    brand: z.string().trim().max(120),
    preheader: z.string().trim().max(200),
    logoUrl: optionalHttpsUrl,
    imageUrl: optionalHttpsUrl,
    imageAlt: z.string().trim().max(200),
    buttonText: z.string().trim().max(80),
    buttonUrl: optionalHttpsUrl,
    footer: z.string().trim().max(500),
}).refine(value => !!value.buttonText === !!value.buttonUrl, {
    message: 'Товчны нэр болон холбоосыг хамтад нь оруулна уу.', path: ['buttonUrl'],
});
export type NewsletterDesign = z.infer<typeof NewsletterDesignSchema>;
export function defaultNewsletterDesign(brand = ''): NewsletterDesign {
    return { layout: 'newsletter', brand, preheader: '', logoUrl: '', imageUrl: '', imageAlt: '', buttonText: '', buttonUrl: '', footer: '' };
}

export const NewsletterActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('setup') }),
    z.object({ action: z.literal('configure'), fromEmail: z.email().max(254), fromName: z.string().trim().min(1).max(120).regex(/^[^<>\"\r\n]+$/) }),
    z.object({ action: z.literal('subscribe'), email: z.email().max(254).transform(v => v.toLowerCase()), consent: z.literal(true) }),
    z.object({ action: z.literal('remove'), contactId: z.string().uuid() }),
    z.object({ action: z.literal('save'), id: z.string().uuid(), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(50000), design: NewsletterDesignSchema.nullable().optional() }),
    z.object({ action: z.literal('prepare'), id: z.string().uuid() }),
    z.object({ action: z.literal('send'), id: z.string().uuid(), confirm: z.literal(true) }),
    z.object({ action: z.literal('refresh'), id: z.string().uuid() }),
]);
export type Newsletter = { id: string; subject: string; body: string; design?: NewsletterDesign | null; broadcast_id: string | null; status: 'draft' | 'preparing' | 'sending' | 'queued' | 'sent' | 'failed' | 'unknown'; created_at: string };

export function newsletterHtml(subject: string, body: string, design?: NewsletterDesign | null) {
    const escape = (s: string) => s.replace(/[&<>"'{}]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '{': '&#123;', '}': '&#125;' })[c]!);
    if (design) {
        // Preview and provider share this renderer. URL checks also protect incomplete editor input.
        const safeUrl = (url: string) => url && optionalHttpsUrl.safeParse(url).success ? escape(url) : '';
        const logo = safeUrl(design.logoUrl);
        const image = safeUrl(design.imageUrl);
        const button = safeUrl(design.buttonUrl);
        const announcement = design.layout === 'announcement';
        const heading = `<tr><td style="padding:32px 28px 24px;${announcement ? 'background:#16345B;color:#ffffff;' : 'color:#16345B;'}"><p style="margin:0 0 12px;font-size:12px;letter-spacing:2px;text-transform:uppercase">${announcement ? 'ЗАРЛАЛ' : 'МЭДЭЭЛЛИЙН ТОВХИМОЛ'}</p><h1 style="margin:0;font-size:30px;line-height:1.25;overflow-wrap:anywhere">${escape(subject)}</h1></td></tr>`;
        const photo = image ? `<tr><td><img src="${image}" alt="${escape(design.imageAlt)}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0"></td></tr>` : '';
        return `<!DOCTYPE html><html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;padding:0;background:#F2F5F9;font-family:Arial,Helvetica,sans-serif;color:#25364A;word-break:break-word">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(design.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F2F5F9"><tr><td align="center" style="padding:24px 8px">
<!--[if mso]><table role="presentation" width="640"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-top:4px solid #2D6FE6">
${design.brand || logo ? `<tr><td style="padding:24px 28px;border-bottom:1px solid #E3E9F0">${logo ? `<img src="${logo}" alt="${escape(design.brand)}" width="140" style="display:block;max-width:140px;height:auto;border:0;margin-bottom:10px">` : ''}${design.brand ? `<p style="margin:0;color:#16345B;font-size:17px;font-weight:bold">${escape(design.brand)}</p>` : ''}</td></tr>` : ''}
${announcement ? photo + heading : heading + photo}
<tr><td style="padding:28px;font-size:16px;line-height:1.8;overflow-wrap:anywhere">${escape(body).replace(/\n/g, '<br>')}${button && design.buttonText ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px"><tr><td bgcolor="#2D6FE6" style="border-radius:4px;text-align:center"><a href="${button}" style="display:inline-block;padding:15px 24px;border:1px solid #2D6FE6;border-radius:4px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold">${escape(design.buttonText)}</a></td></tr></table>` : ''}</td></tr>
<tr><td style="padding:24px 28px;border-top:1px solid #E3E9F0;color:#627185;font-size:12px;line-height:1.7">${design.footer ? `<p style="margin:0 0 12px">${escape(design.footer).replace(/\n/g, '<br>')}</p>` : ''}<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#627185;text-decoration:underline">Мэдээллийн товхимол хүлээн авахаас татгалзах</a></td></tr>
</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
    }
    // Keep existing prepared broadcasts byte-for-byte compatible.
    return `<!DOCTYPE html><html lang="mn"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#222"><main style="max-width:640px;margin:auto;padding:24px"><h1>${escape(subject)}</h1><div style="line-height:1.7">${escape(body).replace(/\n/g, '<br>')}</div><hr><p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Мэдээллийн товхимол хүлээн авахаас татгалзах</a></p></main></body></html>`;
}

/** Same email appearance, with navigation and active content disabled in previews. */
export function newsletterPreviewHtml(subject: string, body: string, design?: NewsletterDesign | null) {
    return newsletterHtml(subject, body, design)
        .replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><style>a{pointer-events:none}</style>')
        .replace(/href="[^"]*"/g, 'href="#" tabindex="-1"');
}
