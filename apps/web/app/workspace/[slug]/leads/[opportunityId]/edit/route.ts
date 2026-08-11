import { updateLeadDetails, type FinancingType } from "@marctco/db";
import { NextResponse } from "next/server";
import { resolveWorkspaceAccess } from "../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

interface EditLeadBody {
  readonly name?: string | null;
  readonly add_phone?: string;
  readonly add_email?: string;
  readonly cpf?: string | null;
  readonly financing_type?: FinancingType | null;
  readonly financial_institution?: string | null;
  readonly installment_amount?: string | null;
}

/**
 * The write half of the card and of the row's quick-edit action (ADR-0013):
 * one route serving both surfaces, since they edit the same lead the same
 * way. Every value that can be typed wrong is normalized inside
 * `updateLeadDetails`, reusing the same pure functions ingestion uses —
 * nothing here re-implements that.
 */
export async function POST(
  request: Request,
  { params }: Readonly<{ params: Promise<{ slug: string; opportunityId: string }> }>
): Promise<NextResponse> {
  const { slug, opportunityId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: EditLeadBody;
  try {
    body = (await request.json()) as EditLeadBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    // Built with conditional spreads, never `field: body.field` directly:
    // `exactOptionalPropertyTypes` treats an optional field as "absent or T",
    // not "T | undefined", and a JSON body omitting a key still types that
    // key as possibly `undefined` here.
    const result = await updateLeadDetails(access.workspace.context, {
      opportunity_id: opportunityId,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.add_phone !== undefined ? { add_phone: body.add_phone } : {}),
      ...(body.add_email !== undefined ? { add_email: body.add_email } : {}),
      ...(body.cpf !== undefined ? { cpf: body.cpf } : {}),
      ...(body.financing_type !== undefined ? { financing_type: body.financing_type } : {}),
      ...(body.financial_institution !== undefined
        ? { financial_institution: body.financial_institution }
        : {}),
      ...(body.installment_amount !== undefined
        ? { installment_amount: body.installment_amount }
        : {})
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown_error" },
      { status: 400 }
    );
  }
}
