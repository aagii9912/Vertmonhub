/**
 * Phone utils — нормчлол, Монгол мобайл таних, текстээс олборлох.
 * Регрессийн гол цэг: чат доторх санамсаргүй 8 оронтой тоог утас гэж андуурахгүй.
 */

import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidMongolianMobile, extractPhoneFromText } from '@/lib/utils/phone';

describe('normalizePhone', () => {
    it('хоосон/null/undefined → null', () => {
        expect(normalizePhone(null)).toBeNull();
        expect(normalizePhone(undefined)).toBeNull();
        expect(normalizePhone('')).toBeNull();
    });

    it('цифр бус тэмдэгтийг хасна', () => {
        expect(normalizePhone('+976 9911-2233')).toBe('99112233');
        expect(normalizePhone('(9911) 2233')).toBe('99112233');
    });

    it('Монголын улсын кодыг (976 / 00976) хасна', () => {
        expect(normalizePhone('97688445566')).toBe('88445566');
        expect(normalizePhone('0097699112233')).toBe('99112233');
    });

    it('аль хэдийн нормчлогдсон дугаарыг хэвээр буцаана', () => {
        expect(normalizePhone('99112233')).toBe('99112233');
    });

    it('цифр огт байхгүй бол null', () => {
        expect(normalizePhone('abc-xyz')).toBeNull();
    });
});

describe('isValidMongolianMobile', () => {
    it('6-9-өөр эхэлсэн 8 оронтой дугаарыг хүлээн зөвшөөрнө', () => {
        expect(isValidMongolianMobile('99112233')).toBe(true);
        expect(isValidMongolianMobile('88445566')).toBe(true);
        expect(isValidMongolianMobile('66001122')).toBe(true);
    });

    it('1-5-аар эхэлсэн эсвэл буруу урттай дугаарыг татгалзана', () => {
        expect(isValidMongolianMobile('12345678')).toBe(false); // 1-ээр эхэлсэн
        expect(isValidMongolianMobile('55112233')).toBe(false); // 5-аар эхэлсэн
        expect(isValidMongolianMobile('9911223')).toBe(false);  // 7 орон
        expect(isValidMongolianMobile('991122334')).toBe(false); // 9 орон
        expect(isValidMongolianMobile(null)).toBe(false);
    });
});

describe('extractPhoneFromText', () => {
    it('текстээс хүчинтэй мобайл дугаар олж нормчилно', () => {
        expect(extractPhoneFromText('Намайг 99887766 дугаараар холбоо бариарай')).toBe('99887766');
        expect(extractPhoneFromText('Утас: +976 8811-2233')).toBe('88112233');
    });

    it('санамсаргүй 8 оронтой тоог (мобайл бус) утас гэж авахгүй', () => {
        expect(extractPhoneFromText('Захиалгын дугаар 12345678')).toBeNull();
        expect(extractPhoneFromText('Огноо 20231231')).toBeNull();
    });

    it('дугаар олдохгүй / хоосон бол null', () => {
        expect(extractPhoneFromText('сайн байна уу')).toBeNull();
        expect(extractPhoneFromText(null)).toBeNull();
    });
});
