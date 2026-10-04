import { describe, expect, it } from 'vitest';
import { buildDynamicKnowledge, buildFAQs } from '../shop-knowledge';

describe('shop knowledge for the assistant prompt', () => {
    it('renders custom knowledge keys as sections, stringifying objects', () => {
        const text = buildDynamicKnowledge({ mandala_garden_payment: '30% урьдчилгаа', amenities: { parking: true } });
        expect(text).toContain('ТУСГАЙ МЭДЭЭЛЭЛ');
        expect(text).toContain('### mandala_garden_payment\n30% урьдчилгаа');
        expect(text).toContain('### amenities\n{"parking":true}');
    });

    it('keeps legacy string knowledge and skips empty input', () => {
        expect(buildDynamicKnowledge('Хуучин мэдлэг')).toContain('### knowledge_legacy\nХуучин мэдлэг');
        expect(buildDynamicKnowledge({})).toBe('');
        expect(buildDynamicKnowledge(null)).toBe('');
    });

    it('numbers FAQs and skips an empty list', () => {
        expect(buildFAQs([{ question: 'Зээл?', answer: 'Тийм' }, { question: 'Төлбөр?', answer: '30%' }]))
            .toContain('1. Q: Зээл?\n   A: Тийм\n2. Q: Төлбөр?\n   A: 30%');
        expect(buildFAQs([])).toBe('');
    });
});
