# Putting Mneme online (Cloudflare Pages)

About 5 minutes. Every push to `main` then rebuilds the site on its own.

1. Go to **dash.cloudflare.com** and sign up (free). Signing up with the GitHub account that owns the repo is easiest.
2. In the left menu, open **Workers & Pages** and click **Create**. Pick the **Pages** tab, then **Import an existing Git repository**.
3. **Connect GitHub.** When GitHub asks which repositories to allow, choose **Only select repositories** and pick `shreywy/Mneme`. Then select `Mneme` and click **Begin setup**.
4. Set up the build:

   | Field | Value |
   |---|---|
   | Project name | `mneme` (this becomes `mneme.pages.dev`; if it's taken, try `mneme-study`) |
   | Production branch | `main` |
   | Framework preset | `Vite` (or `None`) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

5. Open **Environment variables (advanced)** and add these three:

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `24` |
   | `VITE_SUPABASE_URL` | `https://xjlwbzqmawgffkmjixhx.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_iXBJNZLZJuRkOStesRRSHA_onP79AJ8` |

   Both Supabase values are meant to be public. Never paste the secret or service-role key here or anywhere else.
6. Click **Save and Deploy**. The first build takes 1–2 minutes. When it finishes, send me the `*.pages.dev` address it shows.

## After that (I'll walk you through each when we get there)
- **Supabase → Authentication → URL Configuration:** set the Site URL to your pages.dev address and add it to the redirect URLs.
- **GitHub sign-in:** create an OAuth app with the callback URL that Supabase shows.
- **Google sign-in:** same idea, in Google Cloud Console.
- **Email codes for other people:** Supabase's built-in email only reaches you, at 2 per hour. For classmates we'll connect a free sender, such as Gmail with an app password.
