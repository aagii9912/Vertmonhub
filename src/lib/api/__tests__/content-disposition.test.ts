// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contentDispositionFilename } from '../dashboardFetch';

describe('contentDispositionFilename', () => {
    it('reads the RFC 5987 name first, then the encoded or plain filename', () => {
        const name = 'Elysium_Residence_гэрээ_2026-10-22.xlsx';
        expect(contentDispositionFilename(`attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`)).toBe(name);
        expect(contentDispositionFilename(`attachment; filename="${encodeURIComponent(name)}"`)).toBe(name);
        expect(contentDispositionFilename('attachment; filename="ERP-2026-10-22.xlsx"')).toBe('ERP-2026-10-22.xlsx');
        expect(contentDispositionFilename('attachment; filename="100%.xlsx"')).toBe('100%.xlsx');
        expect(contentDispositionFilename('inline')).toBeNull();
        expect(contentDispositionFilename(null)).toBeNull();
    });
});
