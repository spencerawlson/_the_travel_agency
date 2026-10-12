# SEO & search engines

The site already publishes what search engines need:

- `https://farelune.com/robots.txt` points to the sitemap.
- `https://farelune.com/sitemap.xml` lists every page in English and French.
- Each page has a canonical URL, `hreflang` links for `en`, `fr` and `x-default` (see `apps/web/src/lib/seo.ts`), plus Open Graph and Twitter tags for link previews.

The steps below register the site with Google and Bing so you can see indexing, search queries and errors.

## Google Search Console (about 10 minutes)

1. Go to <https://search.google.com/search-console> and sign in with your Google account.
2. Click **Add property** and choose **Domain** (the left option). Enter `farelune.com`, with no `https://` and no `www`.
   A Domain property covers `https://`, `www` and every page in one place.
3. Google shows a **TXT record** that starts with `google-site-verification=`. Copy it.
4. In another tab, open **Cloudflare dashboard → farelune.com → DNS → Records → Add record** and fill it in:
   - **Type:** `TXT`
   - **Name:** `@`
   - **Content:** paste the `google-site-verification=…` value
   - **TTL:** Auto

   Click **Save**. Leave your existing email-routing TXT records (SPF) as they are; a domain can have several TXT records.
5. Back in Search Console, click **Verify**. If it fails, wait 5 minutes and try again. Cloudflare DNS is usually immediate.
6. In the left menu, open **Sitemaps**, enter `sitemap.xml` and click **Submit**. The status should become **Success**.
7. Optional: open **URL inspection**, paste `https://farelune.com/en`, and click **Request indexing**. Repeat for `https://farelune.com/fr`.

Expect data to start appearing after 2–7 days. Things to check later:

- **Pages → Why pages aren't indexed:** "Alternate page with proper canonical" is normal here.
- **Experience → Core Web Vitals.**

Do **not** delete the TXT record. Google re-checks it.

## Bing Webmaster Tools (optional, 2 minutes)

Bing also powers DuckDuckGo, Yahoo and ChatGPT search.

1. Go to <https://www.bing.com/webmasters> and sign in.
2. Choose **Import from Google Search Console**. This copies the verified site and its sitemap, so there is nothing else to set up.

## Checking SEO tags yourself

Next.js streams metadata to normal browsers, so use a crawler user agent to see the final tags:

```bash
curl -s -A "Googlebot" https://farelune.com/fr/destinations | grep -oE '<link rel="(canonical|alternate)"[^>]*>'
```
