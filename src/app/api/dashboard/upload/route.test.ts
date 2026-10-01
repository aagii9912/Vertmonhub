// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({signedIn:true,membership:true,modules:['ai-assistant'],rows:[] as {entity_type:string}[], uploads:[] as {bucket:string,path:string}[],downloads:[] as string[]}));
const shopId='00000000-0000-4000-8000-000000000001';
const userId='00000000-0000-4000-8000-000000000002';
const fileId='00000000-0000-4000-8000-000000000003';
vi.mock('@/lib/auth/supabase-auth',()=>({getUserShop:async()=>state.membership?{id:shopId}:null,getUserId:async()=>state.signedIn?userId:null,assertShopAccess:async(id:string)=>state.membership&&id===shopId?id:null}));
vi.mock('@/lib/auth/require-permission',()=>({requireModuleWrite:async()=>null,resolvePermissions:async()=>state.signedIn?{role:'viewer',permissions:{modules:state.modules}}:null}));
vi.mock('@/lib/utils/logger',()=>({logger:{error:vi.fn()}}));
vi.mock('@/lib/supabase',()=>({supabaseAdmin:()=>({
    from:()=>{const q:any={select:()=>q,eq:()=>q,then:(resolve:any)=>Promise.resolve({data:state.rows,error:null}).then(resolve)};return q;},
    storage:{from:(bucket:string)=>({upload:async(path:string)=>{state.uploads.push({bucket,path});return {error:null};},download:async(path:string)=>{state.downloads.push(path);return {data:new Blob(['synthetic'],{type:'application/pdf'}),error:null};}})},
})}));
import { GET,POST } from './route';
import { privateAttachmentUrl } from '@/lib/ai/private-attachments';
const url=privateAttachmentUrl(`${shopId}/${userId}/${fileId}.pdf`);
const req=()=>new Request(`http://localhost${url}`);
beforeEach(()=>{state.signedIn=true;state.membership=true;state.modules=['ai-assistant'];state.rows=[];state.uploads=[];state.downloads=[];});
describe('private AI file transport',()=>{
    it('uploads into a private bucket and returns a stable authenticated URL',async()=>{
        const form=new FormData();form.append('file',new File(['synthetic'],'contract.pdf',{type:'application/pdf'}));
        const res=await POST(new Request('http://localhost/api/dashboard/upload',{method:'POST',body:form}));
        expect(res.status).toBe(200);expect(state.uploads[0].bucket).toBe('ai-attachments');
        expect(state.uploads[0].path.startsWith(`${shopId}/${userId}/`)).toBe(true);
        expect((await res.json()).url).toBe(privateAttachmentUrl(state.uploads[0].path));
    });
    it('rejects anonymous access and revoked shop membership before downloading',async()=>{
        state.signedIn=false;expect((await GET(req())).status).toBe(401);
        state.signedIn=true;state.membership=false;expect((await GET(req())).status).toBe(404);
        expect(state.downloads).toEqual([]);
    });
    it('requires the attached entity module and streams without public URLs or shared caching',async()=>{
        state.rows=[{entity_type:'contract'}];expect((await GET(req())).status).toBe(403);
        expect(state.downloads).toEqual([]);state.modules=['contracts'];
        const res=await GET(req());expect(res.status).toBe(200);expect(await res.text()).toBe('synthetic');
        expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    });
});
