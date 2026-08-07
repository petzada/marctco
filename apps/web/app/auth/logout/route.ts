import type { NextResponse } from "next/server";
import { redirectTo } from "../../../lib/redirect-response";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return redirectTo("/login");
}
