import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManagerPicker } from './pickers';

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
