/**
 * HubSpot CRM v3 API client
 * Supports Private App tokens (modern) and legacy API tokens — both use Bearer auth.
 */

const HUBSPOT_BASE = 'https://api.hubapi.com';

export interface HubspotContactProperties {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    mobilephone?: string;
    company?: string;
    address?: string;
    city?: string;
    lifecyclestage?: string;
    hs_lead_status?: string;
    notes_last_contacted?: string;
    hubspot_owner_id?: string;
    createdate?: string;
    lastmodifieddate?: string;
    [key: string]: string | undefined;
}

export interface HubspotContact {
    id: string;
    properties: HubspotContactProperties;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
}

export interface HubspotPaging {
    next?: { after: string; link?: string };
}

export interface HubspotContactList {
    results: HubspotContact[];
    paging?: HubspotPaging;
}

const DEFAULT_PROPERTIES = [
    'firstname',
    'lastname',
    'email',
    'phone',
    'mobilephone',
    'company',
    'address',
    'city',
    'lifecyclestage',
    'hs_lead_status',
    'notes_last_contacted',
    'createdate',
];

export class HubspotApiError extends Error {
    constructor(message: string, public status: number, public body?: unknown) {
        super(message);
        this.name = 'HubspotApiError';
    }
}

async function hsFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${HUBSPOT_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
    });

    if (!res.ok) {
        let body: unknown;
        try { body = await res.json(); } catch { /* ignore */ }
        const msg = (body as any)?.message || res.statusText;
        throw new HubspotApiError(`HubSpot API ${res.status}: ${msg}`, res.status, body);
    }

    return res.json() as Promise<T>;
}

/**
 * Fetch a single page of contacts.
 */
export function fetchContactsPage(
    token: string,
    options: { after?: string; limit?: number; properties?: string[] } = {}
): Promise<HubspotContactList> {
    const params = new URLSearchParams();
    params.set('limit', String(options.limit ?? 100));
    if (options.after) params.set('after', options.after);
    for (const p of options.properties ?? DEFAULT_PROPERTIES) {
        params.append('properties', p);
    }
    return hsFetch<HubspotContactList>(`/crm/v3/objects/contacts?${params.toString()}`, token);
}

/**
 * Fetch ALL contacts (paginated). Hard cap to avoid runaway memory.
 */
export async function fetchAllContacts(
    token: string,
    maxContacts = 5000
): Promise<HubspotContact[]> {
    const all: HubspotContact[] = [];
    let after: string | undefined;
    let safety = 0;

    while (all.length < maxContacts && safety++ < 100) {
        const page = await fetchContactsPage(token, { after, limit: 100 });
        all.push(...page.results);
        const next = page.paging?.next?.after;
        if (!next) break;
        after = next;
    }

    return all.slice(0, maxContacts);
}

/**
 * Verify a token by calling /crm/v3/objects/contacts?limit=1
 */
export async function verifyHubspotToken(token: string): Promise<{ ok: boolean; total?: number; error?: string }> {
    try {
        const page = await fetchContactsPage(token, { limit: 1 });
        return { ok: true, total: page.results.length };
    } catch (err) {
        if (err instanceof HubspotApiError) {
            return { ok: false, error: `${err.status}: ${err.message}` };
        }
        return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}
