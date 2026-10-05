import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryPicker, ManagerPicker } from './pickers';

const managers = [
    { name: 'Mandala manager', is_active: true, project_ids: ['mandala'] },
    { name: 'Elysium manager', is_active: true, project_ids: ['elysium'] },
];

describe('project manager picker', () => {
    it('only offers managers in the lead project', () => {
        const change = vi.fn();
        render(<ManagerPicker value={null} projectId="mandala" options={managers} onChange={change} />);
        fireEvent.click(screen.getByRole('button', { name: 'Менежер солих' }));
        expect(screen.queryByRole('button', { name: 'Elysium manager' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Mandala manager' }));
        expect(change).toHaveBeenCalledWith('Mandala manager');
    });

    it.each([null, 'unknown'])('does not assign a lead with project %s', projectId => {
        render(<ManagerPicker value={null} projectId={projectId} options={managers} onChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Менежер солих' })).not.toBeInTheDocument();
    });
});

const categories = [
    { id: 'investor', name: 'Хөрөнгө оруулагч', tone: 'success', is_active: true },
    { id: 'barter', name: 'Бартер', tone: 'neutral', is_active: false },
    { id: 'tenant', name: 'Түрээслэгч', tone: 'info', is_active: true },
];

describe('lead category picker', () => {
    it('offers active categories and clearing, and reports only real changes', () => {
        const change = vi.fn();
        render(<CategoryPicker value="investor" options={categories} onChange={change} />);
        fireEvent.click(screen.getByRole('button', { name: 'Ангилал солих' }));
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Ангилалгүй', 'Хөрөнгө оруулагч', 'Түрээслэгч']);
        fireEvent.click(screen.getByRole('option', { name: 'Хөрөнгө оруулагч' }));
        expect(change).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Ангилал солих' }));
        fireEvent.click(screen.getByRole('option', { name: 'Ангилалгүй' }));
        expect(change).toHaveBeenCalledWith(null);
    });

    it('shows a current archived category without offering archived ones for new picks', () => {
        const change = vi.fn();
        render(<CategoryPicker value="barter" options={categories} onChange={change} />);
        expect(screen.getByRole('button', { name: 'Ангилал солих' })).toHaveTextContent('Бартер (архив)');
        fireEvent.click(screen.getByRole('button', { name: 'Ангилал солих' }));
        fireEvent.click(screen.getByRole('option', { name: 'Түрээслэгч' }));
        expect(change).toHaveBeenCalledWith('tenant');
    });

    it('is read-only when disabled or when the project has no categories', () => {
        const { rerender } = render(<CategoryPicker value={null} options={categories} disabled onChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Ангилал солих' })).not.toBeInTheDocument();
        expect(screen.getByText('Ангилалгүй')).toBeInTheDocument();
        rerender(<CategoryPicker value={null} options={[]} onChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Ангилал солих' })).not.toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('applies a bulk choice even without a current value', () => {
        const change = vi.fn();
        render(<CategoryPicker value={undefined} placeholder="Сонгох" options={categories} onChange={change} />);
        fireEvent.click(screen.getByRole('button', { name: 'Ангилал солих' }));
        fireEvent.click(screen.getByRole('option', { name: 'Ангилалгүй' }));
        expect(change).toHaveBeenCalledWith(null);
    });
});
