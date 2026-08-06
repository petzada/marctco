import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function supabaseEnvironment(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase Auth requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, key };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnvironment();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot persist refreshed cookies. proxy.ts is
          // the only request boundary that writes them back to the browser.
        }
      }
    }
  });
}

export interface AuthenticatedSession {
  readonly user_id: string;
  /** Verified JWT claims. Only `app_metadata` may carry a right. */
  readonly claims: Record<string, unknown>;
}

/**
 * Verifies the Supabase session server-side. The claims travel with it because
 * the provisioning right lives in `app_metadata`; nothing in this app reads a
 * right from `user_metadata`, which the browser can rewrite.
 */
export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string") {
    return null;
  }
  return { user_id: claims.sub, claims };
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getAuthenticatedSession();
  return session?.user_id ?? null;
}
