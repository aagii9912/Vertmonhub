# 🚀 SmartHub Deployment Guide

## Pre-Deployment Checklist

### 1. Database Migrations ✅

Run all migrations in order in Supabase SQL Editor:

```sql
-- Check current migrations
SELECT * FROM migrations ORDER BY applied_at;

-- Run in order:
001_initial_schema.sql
002_add_facebook_oauth.sql
003_add_decrement_stock.sql
004_add_crm_columns.sql
005_add_marketing.sql
006_add_payments.sql
007_add_email_settings.sql
008_implement_rls.sql  ← NEW: Security policies
```

**Verify:**
```sql
-- All tables should have RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

### 2. Environment Variables ⚙️

#### Required Production Variables

Create `.env.production` or set in hosting platform:

```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# QPay (Production)
QPAY_CLIENT_ID=prod_xxx
QPAY_CLIENT_SECRET=prod_xxx
QPAY_MERCHANT_ID=xxx
QPAY_ENV=production

# Email
RESEND_API_KEY=re_xxx
EMAIL_FROM=orders@yourdomain.com

# Site
NEXT_PUBLIC_SITE_URL=https://smarthub.mn
NODE_ENV=production
```

**Verify all required keys are set!**

### 3. Build Verification 🏗️

```bash
# Clean build
npm run build

# Expected output:
✓ Compiled successfully
✓ TypeScript check passed
✓ Generating static pages
```

**No errors = ready to deploy!**

---

## Deployment Steps

### Option A: Vercel (Recommended)

#### 1. Connect Repository

```bash
# Push to GitHub
git add .
git commit -m "Production ready - Phase 3 complete"
git push origin main
```

#### 2. Deploy on Vercel

1. Go to https://vercel.com
2. Import your repository
3. Configure:
   - Framework: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`

#### 3. Set Environment Variables

In Vercel Dashboard → Settings → Environment Variables:
- Add all variables from `.env.production.example`
- Set Environment: Production

#### 4. Deploy

- Click "Deploy"
- Wait for build (~2-3 minutes)
- Done! 🎉

#### 5. Configure Custom Domain

- Vercel Dashboard → Domains
- Add your domain: `smarthub.mn`
- Update DNS records as instructed

---

### Option B: Self-Hosted (VPS/Docker)

#### 1. Build Production Bundle

```bash
npm run build
npm run start
```

#### 2. Use PM2 for Process Management

```bash
npm install -g pm2
pm2 start npm --name "smarthub" -- start
pm2 save
pm2 startup
```

#### 3. Nginx Configuration

```nginx
server {
    listen 80;
    server_name smarthub.mn;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 4. SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d smarthub.mn
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
# Test main page
curl https://smarthub.mn

# Test API endpoints
curl https://smarthub.mn/api/health

# Test payment webhook
curl https://smarthub.mn/api/payment/webhook
```

### 2. Database Connection

- Login to dashboard
- Check if data loads
- Create test order
- Verify in Supabase

### 3. Payment System

#### QPay Integration

1. **Configure webhook URL in QPay:**
   ```
   https://smarthub.mn/api/payment/webhook
   ```

2. **Test payment flow:**
   - Create order
   - Generate QPay invoice
   - Make test payment (UAT mode)
   - Verify order updates

### 4. Email Delivery

#### Resend Setup

1. **Verify sending domain:**
   - Resend Dashboard → Domains
   - Add DNS records (SPF, DKIM)
   - Verify domain

2. **Test email:**
   ```bash
   # Send test payment email
   curl -X POST https://smarthub.mn/api/payment/webhook \
     -H "Content-Type: application/json" \
     -d '{"invoice_id":"TEST123","status":"paid"}'
   ```

   Check customer email inbox!

---

## Security Checklist

### Before Going Live

- [ ] All environment variables set
- [ ] RLS migration applied (008)
- [ ] All Supabase security warnings resolved
- [ ] HTTPS enabled (SSL certificate)
- [ ] Database backups configured
- [ ] Error monitoring setup (Sentry)
- [ ] Rate limiting configured (Vercel/Nginx)
- [ ] API keys rotated from development
- [ ] Test endpoints removed
- [ ] Admin panel access restricted

### Supabase Security

#### 1. Enable RLS

```sql
-- Verify RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- All should show: rowsecurity = true
```

#### 2. Check Policies

```sql
-- Count policies per table
SELECT tablename, COUNT(*) 
FROM pg_policies 
WHERE schemaname = 'public' 
GROUP BY tablename;

-- Expected: 4 policies per table (SELECT, INSERT, UPDATE, DELETE)
```

#### 3. Test Multi-Shop Isolation

1. Create 2 test shops
2. Login as Shop A
3. Try to access Shop B's data
4. Should fail with RLS violation

---

## Monitoring & Maintenance

### Error Tracking

#### Sentry (Recommended)

```bash
npm install @sentry/nextjs

# Configure in next.config.js
```

### Performance Monitoring

#### Vercel Analytics

- Automatically enabled on Vercel
- View in Dashboard → Analytics

### Database Monitoring

#### Supabase Dashboard

- Monitor query performance
- Track storage usage
- Check API usage

### Backup Strategy

#### Database Backups

1. **Supabase automatic backups:**
   - Enabled by default
   - Point-in-time recovery available

2. **Manual backup:**
   ```bash
   # Export data
   pg_dump -h db.xxx.supabase.co -U postgres \
     -d postgres > backup.sql
   ```

---

## Rollback Plan

### If Deployment Fails

#### 1. Revert to Previous Version

**Vercel:**
- Dashboard → Deployments
- Click previous deployment
- "Promote to Production"

**Self-hosted:**
```bash
git revert HEAD
git push origin main
pm2 restart smarthub
```

#### 2. Disable RLS (Emergency Only)

```sql
-- ONLY if RLS breaking production
ALTER TABLE shops DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
-- ... repeat for all tables
```

**Note:** Re-enable RLS immediately after fixing issues!

---

## Troubleshooting

### Common Issues

#### 1. "Unauthorized" Errors

**Cause:** RLS policies too strict  
**Fix:** Check user→shop mapping

```sql
-- Debug user's shop_id
SELECT id, shop_id FROM users WHERE id = auth.uid();
```

#### 2. Payment Webhook Not Working

**Cause:** URL not configured in QPay  
**Fix:**
- QPay Dashboard → Webhook
- Set: `https://yourdomain.com/api/payment/webhook`

#### 3. Emails Not Sending

**Cause:** Domain not verified  
**Fix:**
- Resend Dashboard → Domains
- Add DNS records
- Wait for verification

#### 4. Build Errors

**Check:**
```bash
npm run build 2>&1 | grep -i error
```

**Common:**
- Missing environment variables
- TypeScript errors
- Import path issues

---

## Launch Day Checklist

### T-1 Day (Before Launch)

- [ ] Full backup of database
- [ ] All tests passing
- [ ] Staging environment tested
- [ ] Email templates verified
- [ ] Payment flow tested (UAT)
- [ ] Error monitoring configured
- [ ] Team notified

### Launch Day

- [ ] Deploy to production
- [ ] Verify all endpoints
- [ ] Test payment flow
- [ ] Send test email
- [ ] Monitor error logs
- [ ] Check performance
- [ ] Announce launch! 🎉

### T+1 Day (After Launch)

- [ ] Review error logs
- [ ] Check payment success rate
- [ ] Monitor email delivery
- [ ] Collect user feedback
- [ ] Performance optimization

---

## Support & Maintenance

### Regular Tasks

**Daily:**
- Check error logs
- Monitor payment status
- Review email delivery

**Weekly:**
- Database backup verification
- Performance review
- Security updates

**Monthly:**
- Rotate API keys
- Update dependencies
- Security audit

---

## Contact Information

### Service Providers

**QPay Support:**
- Email: info@qpay.mn
- Phone: +976 xxxx xxxx

**Resend Support:**
- Email: support@resend.com
- Docs: https://resend.com/docs

**Supabase Support:**
- Dashboard → Support
- Docs: https://supabase.com/docs

---

**Deployment амжилттай болно! 🚀**
