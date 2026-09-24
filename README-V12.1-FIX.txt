TDM MANUFACTURING V12.1 - SUPABASE/API FIX

1. The supplied publishable Supabase key is already the key used throughout this V12 project:
   Project URL: https://ctdmpigyhinaqpicbycq.supabase.co
   The app files were normalized/checked against the supplied key.

2. The screenshot error "Orders.shipping_address does not exist" is a Supabase schema error.
   Run SUPABASE-V12.1-FIX.sql in Supabase SQL Editor.

3. The SQL also creates/repairs:
   - shipping_address and checkout fee fields on Orders
   - shipping_zones
   - shipping_settings
   - home_banners
   - products.media_urls
   - tdm-media storage bucket/policies
   - order indexes for a growing order dashboard

4. The service-worker cache name was bumped to V12.1 so browsers/PWA installs do not keep the older cached V12 files.

5. Upload the contents of this ZIP to the GitHub Pages repository root, replacing the old V12 files.

6. After deployment, refresh the app once. If Chrome still shows the old version, close the installed PWA/browser tab and reopen the GitHub Pages URL so the new service worker can activate.

IMPORTANT:
- Do not put a Supabase service_role/secret key in the website.
- The publishable/anon key is the appropriate browser-side key.
- Real Paystack/card charging still needs the live payment-provider integration and webhook setup.
