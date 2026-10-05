// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ContactForm } from './ContactForm';

const QUICK_KEY = 'vertmon_contact_quick';
type Sent = { url: string; init: RequestInit };
const sent: Sent[] = [];

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        sent.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ success: true, receipt_id: 'lead-1' }) };
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    sent.length = 0;
    localStorage.clear();
    window.history.replaceState({}, '', '/contact');
});

const body = (index = 0) => JSON.parse(String(sent[index].init.body));

describe('public contact form', () => {
    it('brands the header with the server-resolved project and falls back to Vertmon', () => {
        const { unmount } = render(<ContactForm projectName="Elysium Residence" canQuickEntry={false} />);
        expect(screen.getByRole('banner')).toHaveTextContent('Elysium Residence');
        expect(screen.queryByText('Мандала Гарден')).not.toBeInTheDocument();
        unmount();

        render(<ContactForm projectName={null} canQuickEntry={false} />);
        expect(screen.getByRole('banner')).toHaveTextContent('Vertmon');
    });

    it('never offers quick entry to the public, even with ?quick=1 or a stored tablet preference', () => {
        window.history.replaceState({}, '', '/contact?quick=1');
        localStorage.setItem(QUICK_KEY, '1');
        render(<ContactForm projectName="Mandala Garden" canQuickEntry={false} />);

        expect(screen.queryByRole('button', { name: /Түргэн бүртгэл|Бүрэн анкет/ })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Бидэнтэй холбогдоно уу' })).toBeInTheDocument();
        // Олон нийтийн анкетад «Уулзалт» эх үүсвэр урьдчилан сонгогдохгүй.
        const sources = screen.getByRole('group', { name: 'Мэдээллийг анх хаанаас авсан бэ?' });
        expect(within(sources).getByRole('button', { name: 'Уулзалт' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('labels every input, groups choice chips and links the privacy policy', () => {
        render(<ContactForm projectName="Mandala Garden" canQuickEntry={false} />);

        expect(screen.getByLabelText(/Овог, нэр/)).toHaveAttribute('id', 'contact-name');
        expect(screen.getByLabelText(/Утас/)).toHaveAttribute('inputmode', 'tel');
        expect(screen.getByLabelText('И-мэйл')).toHaveAttribute('type', 'email');
        expect(screen.getByLabelText('Нэмэлт').tagName).toBe('TEXTAREA');

        for (const name of ['Сонирхож буй ээлж', 'Сонирхож буй өрөөний тоо', 'Төлбөрийн нөхцөл', 'Урьдчилгаа төлбөрийн хэмжээ', 'Мэдээллийг анх хаанаас авсан бэ?']) {
            const group = screen.getByRole('group', { name });
            for (const chip of within(group).getAllByRole('button')) expect(chip).toHaveAttribute('aria-pressed', 'false');
        }
        const phase = within(screen.getByRole('group', { name: 'Сонирхож буй ээлж' })).getByRole('button', { name: 'II — Water Garden' });
        fireEvent.click(phase);
        expect(phase).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(phase);
        expect(phase).toHaveAttribute('aria-pressed', 'false');

        expect(screen.getByText(/Мэдээллийг зөвхөн тантай холбогдоход ашиглана\./)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Нууцлалын бодлого' })).toHaveAttribute('href', '/privacy');
    });

    it('submits the unchanged public payload to /api/leads', async () => {
        render(<ContactForm projectName="Mandala Garden" canQuickEntry={false} />);

        fireEvent.change(screen.getByLabelText(/Овог, нэр/), { target: { value: 'Бат' } });
        fireEvent.change(screen.getByLabelText(/Утас/), { target: { value: '99112233' } });
        fireEvent.click(screen.getByRole('button', { name: 'II — Water Garden' }));
        fireEvent.click(screen.getByRole('button', { name: '2 өрөө' }));
        fireEvent.click(screen.getByRole('button', { name: 'Банкны зээл' }));
        fireEvent.click(screen.getByRole('button', { name: '30%' }));
        fireEvent.click(screen.getByRole('button', { name: 'Facebook' }));
        fireEvent.change(screen.getByLabelText('Нэмэлт'), { target: { value: ' Асуулт ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хүсэлт илгээх' }));

        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].url).toBe('/api/leads');
        expect(sent[0].init).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        expect(body()).toEqual({
            name: 'Бат', phone: '99112233', email: null,
            interested_phase: 'II — Water Garden', preferred_rooms: 2, preferred_type: 'apartment',
            financing_intent: 'bank_loan', advance_percent: 30, source: 'facebook', message: 'Асуулт', website: '',
        });
        expect(await screen.findByRole('heading', { name: 'Баярлалаа, Бат!' })).toBeInTheDocument();
    });

    it('announces validation and server errors', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: 'Хэт олон хүсэлт' }) })));
        render(<ContactForm projectName={null} canQuickEntry={false} />);

        fireEvent.click(screen.getByRole('button', { name: 'Хүсэлт илгээх' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Нэр болон утсаа оруулна уу.');

        fireEvent.change(screen.getByLabelText(/Овог, нэр/), { target: { value: 'Бат' } });
        fireEvent.change(screen.getByLabelText(/Утас/), { target: { value: '99112233' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хүсэлт илгээх' }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Хэт олон хүсэлт'));
    });
});

describe('staff quick entry', () => {
    it('shows the toggle to staff with lead write access and keeps the quick payload', async () => {
        render(<ContactForm projectName="Mandala Garden" canQuickEntry />);

        fireEvent.click(screen.getByRole('button', { name: 'Түргэн бүртгэл' }));
        expect(screen.getByRole('heading', { name: 'Түргэн бүртгэл' })).toBeInTheDocument();
        expect(localStorage.getItem(QUICK_KEY)).toBe('1');
        const sources = screen.getByRole('group', { name: 'Эх үүсвэр' });
        expect(within(sources).getByRole('button', { name: 'Уулзалт' })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.change(screen.getByLabelText(/Овог, нэр/), { target: { value: 'Сараа' } });
        fireEvent.change(screen.getByLabelText(/Утас/), { target: { value: '88112233' } });
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));

        await waitFor(() => expect(sent).toHaveLength(1));
        expect(body()).toEqual({ name: 'Сараа', phone: '88112233', email: null, source: 'meeting', website: '' });
        expect(await screen.findByRole('heading', { name: 'Бүртгэгдлээ!' })).toBeInTheDocument();
    });

    it('restores the tablet preference from ?quick=1 for staff', async () => {
        window.history.replaceState({}, '', '/contact?quick=1');
        render(<ContactForm projectName="Mandala Garden" canQuickEntry />);

        expect(await screen.findByRole('heading', { name: 'Түргэн бүртгэл' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Бүрэн анкет' }));
        expect(screen.getByRole('heading', { name: 'Бидэнтэй холбогдоно уу' })).toBeInTheDocument();
        expect(localStorage.getItem(QUICK_KEY)).toBe('0');
    });
});
