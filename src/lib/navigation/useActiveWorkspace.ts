'use client';

import { usePathname } from 'next/navigation';
import {
    getWorkspaceForPath,
    type Workspace,
    type WorkspaceId,
} from './workspaces';

const LAST_WORKSPACE_KEY = 'vertmonhub_active_workspace';
const lastRouteKey = (id: WorkspaceId) => `vertmonhub_ws_last_route_${id}`;

/** Идэвхтэй workspace-ийг URL-аас тооцоолно (ганц эх сурвалж = pathname). */
export function useActiveWorkspace(): Workspace {
    const pathname = usePathname() || '/dashboard';
    return getWorkspaceForPath(pathname);
}

/**
 * Workspace бүрийн сүүлд зочилсон дэд хуудсыг localStorage-д хадгална.
 * (AuthContext-ийн ACTIVE_SHOP_KEY загвартай адил — SSR/нууц горимд аюулгүй.)
 * Зөвхөн event handler / useEffect дотроос дуудна, render үед хэзээ ч биш.
 */
export function rememberSubroute(id: WorkspaceId, href: string) {
    try {
        localStorage.setItem(lastRouteKey(id), href);
        localStorage.setItem(LAST_WORKSPACE_KEY, id);
    } catch {
        /* SSR эсвэл хувийн горим — алгасна */
    }
}

/** Switcher дээр дарахад очих хаяг: сүүлд зочилсон дэд хуудас, эс бөгөөс home. */
export function getSwitchTarget(ws: Workspace): string {
    try {
        return localStorage.getItem(lastRouteKey(ws.id)) || ws.home;
    } catch {
        return ws.home;
    }
}
