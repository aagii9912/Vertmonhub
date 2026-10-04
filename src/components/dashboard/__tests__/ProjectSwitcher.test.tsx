// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ shop: { id: 'garden', name: 'Mandala Garden' }, shops: [] as Array<{ id: string; name: string }>, switchShop: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
import { ProjectSwitcher } from '../ProjectSwitcher';

beforeEach(() => { auth.switchShop.mockReset(); });

describe('ProjectSwitcher', () => {
    it('shows only the name when the user works on one project', () => {
        auth.shops = [{ id: 'garden', name: 'Mandala Garden' }];
        render(<ProjectSwitcher />);
        expect(screen.getByText('Mandala Garden')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Төсөл солих/ })).not.toBeInTheDocument();
        const { container } = render(<ProjectSwitcher variant="compact" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('switches to another project shop and ignores the active one', () => {
        auth.shops = [{ id: 'garden', name: 'Mandala Garden' }, { id: 'elysium', name: 'Elysium Residence' }];
        render(<ProjectSwitcher />);
        const trigger = screen.getByRole('button', { name: 'Төсөл солих. Одоогийн төсөл: Mandala Garden' });
        fireEvent.keyDown(trigger, { key: 'Enter' });
        fireEvent.click(screen.getByRole('menuitem', { name: 'Mandala Garden' }));
        expect(auth.switchShop).not.toHaveBeenCalled();
        fireEvent.keyDown(screen.getByRole('button', { name: /Төсөл солих/ }), { key: 'Enter' });
        fireEvent.click(screen.getByRole('menuitem', { name: 'Elysium Residence' }));
        expect(auth.switchShop).toHaveBeenCalledWith('elysium');
    });
});
