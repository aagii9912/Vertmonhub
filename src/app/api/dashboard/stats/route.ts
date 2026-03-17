import { NextRequest, NextResponse } from 'next/server';
import { getClerkUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getStartOfPeriod } from '@/lib/utils/date';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter';
import { safeErrorResponse } from '@/lib/utils/safe-error';

export async function GET(request: NextRequest) {
  try {
    const authShop = await getClerkUserShop();

    const identifier = authShop?.id || getClientIdentifier(request) || 'anonymous';
    const rateLimitResult = checkRateLimit(`stats:${identifier}`, { windowMs: 60000, maxRequests: 30 });

    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult.resetAt);
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || 'today') as 'today' | 'week' | 'month';

    if (!authShop) {
      return NextResponse.json({
        shop: null,
        stats: {
          totalProperties: 0,
          totalLeads: 0,
          monthlyViewings: 0,
          pendingContracts: 0,
          totalCustomers: 0,
        },
        recentLeads: [],
        recentChats: [],
        activeConversations: [],
        unansweredCount: 0,
      });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;
    const periodStart = getStartOfPeriod(period);

    // Properties count
    const { count: totalProperties } = await supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId);

    // Leads count
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId);

    // Viewings this period
    const { count: monthlyViewings } = await supabase
      .from('viewings')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .gte('created_at', periodStart.toISOString());

    // Pending contracts
    const { count: pendingContracts } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('status', 'pending');

    // Total customers
    const { count: totalCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId);

    // Recent leads
    const { data: recentLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Recent chats (grouped by customer)
    const { data: recentChats } = await supabase
      .from('chat_history')
      .select(`
        id, message, response, intent, role, created_at, customer_id,
        customers (name)
      `)
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Group chats by customer into conversations
    const conversationMap = new Map<string, {
      customerId: string;
      customerName: string;
      messageCount: number;
      lastMessage: string;
      lastMessageAt: string;
      lastIntent: string | null;
      isAnswered: boolean;
    }>();

    recentChats?.forEach(chat => {
      const customerId = chat.customer_id;
      if (!customerId) return;

      const existing = conversationMap.get(customerId);
      const isUserMessage = chat.role === 'user';
      const customerObj = chat.customers as unknown as { name: string } | null;
      const customerName = customerObj?.name || 'Харилцагч';

      if (!existing) {
        conversationMap.set(customerId, {
          customerId,
          customerName,
          messageCount: 1,
          lastMessage: chat.message || '',
          lastMessageAt: chat.created_at,
          lastIntent: chat.intent,
          isAnswered: !isUserMessage,
        });
      } else {
        existing.messageCount++;
        if (new Date(chat.created_at) > new Date(existing.lastMessageAt)) {
          existing.lastMessage = chat.message || '';
          existing.lastMessageAt = chat.created_at;
          existing.lastIntent = chat.intent;
          existing.isAnswered = !isUserMessage;
        }
      }
    });

    const activeConversations = Array.from(conversationMap.values())
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 10);

    const unansweredCount = activeConversations.filter(c => !c.isAnswered).length;

    return NextResponse.json({
      shop: { id: authShop.id, name: authShop.name },
      stats: {
        totalProperties: totalProperties || 0,
        totalLeads: totalLeads || 0,
        monthlyViewings: monthlyViewings || 0,
        pendingContracts: pendingContracts || 0,
        totalCustomers: totalCustomers || 0,
      },
      recentLeads: recentLeads || [],
      recentChats: recentChats || [],
      activeConversations,
      unansweredCount,
    });
  } catch (error) {
    return safeErrorResponse(error, 'Dashboard stats унших алдаа');
  }
}
