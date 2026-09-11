import { describe, it, expect } from 'vitest';
import { missingEnv, missingProdEnv, REQUIRED_PROD_ENV } from '../env';

describe('env validation', () => {
    it('lists missing and blank variables', () => {
        expect(missingEnv(['A', 'B', 'C'], { A: 'x', B: '   ' } as unknown as NodeJS.ProcessEnv)).toEqual(['B', 'C']);
    });

    it('CRON_SECRET and FACEBOOK_VERIFY_TOKEN are required in production', () => {
        expect(REQUIRED_PROD_ENV).toContain('CRON_SECRET');
        expect(REQUIRED_PROD_ENV).toContain('FACEBOOK_VERIFY_TOKEN');
        const { required } = missingProdEnv({} as unknown as NodeJS.ProcessEnv);
        expect(required).toEqual([...REQUIRED_PROD_ENV]);
    });
});
