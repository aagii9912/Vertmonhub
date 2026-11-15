import { describe, expect, it } from 'vitest';
import { referralFromNote } from '../referral-from-notes';

describe('referralFromNote («Сэжим» from the meeting note)', () => {
    it('recognises the words the team writes (real notes of 2026-11-15)', () => {
        expect(referralFromNote('facebook')).toBe('Facebook');
        expect(referralFromNote('Фэйсбүүк')).toBe('Facebook');
        expect(referralFromNote('фэйсбүүкээс мэдээлэл аван ирж уулзсан.')).toBe('Facebook');
        expect(referralFromNote('FB-ээс харсан')).toBe('Facebook');
        expect(referralFromNote('ойрхон амьдардаг')).toBe('Ойрхон амьдардаг');
        expect(referralFromNote('Ойрхон явж байсан.')).toBe('Ойрхон амьдардаг');
        expect(referralFromNote('ойр ажилладаг')).toBe('Ойрхон амьдардаг');
        expect(referralFromNote('өдөр бүр хажуугаар явдаг')).toBe('Ойрхон амьдардаг');
        expect(referralFromNote('танил')).toBe('Танил');
        expect(referralFromNote('Мандала гарден ОС, гадаадад байгаа эгчдээ')).toBe('Мандала Гарден ОС');
        expect(referralFromNote('мандала гарден оршин суугч')).toBe('Мандала Гарден ОС');
        expect(referralFromNote('бармаш түрээслэгч, охиндоо')).toBe('Бармаш түрээслэгч');
        expect(referralFromNote('инстаграмаас')).toBe('Инстаграм');
    });

    it('takes the word written first when several match — one source per meeting', () => {
        expect(referralFromNote('ойрхон амьдардаг, фэйсбүүкээс мэдээлэл аваад ирж уулзсан.')).toBe('Ойрхон амьдардаг');
        expect(referralFromNote('фэйсбүүкээс мэдээлэл аваад ирсэн, ойрхон амьдардаг')).toBe('Facebook');
        expect(referralFromNote('монконы ажилтны найз')).toBe('Монкон');
    });

    it('never matches a word inside another word', () => {
        // «ойрд» биш «ойр»; «fbi» биш «fb».
        expect(referralFromNote('ойрд холбогдоно гэсэн')).toBe('Бусад');
        expect(referralFromNote('fbi кино үзсэн')).toBe('Бусад');
    });

    it('puts an unrecognised note in «Бусад» and keeps an empty note unknown', () => {
        expect(referralFromNote('дараа долоо хоногт гэрээ байгуулахаар болсон')).toBe('Бусад');
        expect(referralFromNote('')).toBeNull();
        expect(referralFromNote('   ')).toBeNull();
        expect(referralFromNote(null)).toBeNull();
        expect(referralFromNote(undefined)).toBeNull();
    });

    it('uses the project\'s own source names when the note contains one', () => {
        expect(referralFromNote('Хаан тауэрийн өдөрлөгөөс мэдээлэл авсан', ['Өдөрлөг'])).toBe('Өдөрлөг');
        expect(referralFromNote('самбар харсан, ойрхон амьдардаг', ['Гадна самбар', 'Самбар'])).toBe('Самбар');
        // Төслийн «Бусад» нэр тэмдэглэлд тааруулах үг биш.
        expect(referralFromNote('бусад хүнээс сонссон', ['Бусад'])).toBe('Бусад');
    });
});
