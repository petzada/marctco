import type { NextResponse } from "next/server";
import { redirectTo } from "../lib/redirect-response";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return redirectTo("/access", 307);
}
