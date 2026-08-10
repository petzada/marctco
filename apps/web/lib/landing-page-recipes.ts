export const LANDING_PAGE_ENDPOINT_PATH = "/v1/integrations/webhooks/leads";

export const canonicalLandingPagePayload = `{
  "schema_version": "v1",
  "source": "LANDING_PAGE",
  "external_lead_id": "id-estavel-da-submissao",
  "name": "Maria Souza",
  "phone": "11999998888",
  "email": "maria@exemplo.com",
  "cpf": "52998224725",
  "financing_type": "VEHICLE",
  "financial_institution": "Banco Exemplo",
  "installment_amount": "1.250,90",
  "campaign_id": "campanha-2026",
  "form_id": "simulacao-revisional"
}`;

export const wordpressBaseRecipe = `// wp-config.php, no servidor. Nunca coloque estes valores no JavaScript da página.
define( 'MARCTCO_LP_URL', 'https://SEU-CRM.example/v1/integrations/webhooks/leads' );
define( 'MARCTCO_LP_TOKEN', 'COLE_O_TOKEN_DA_CONEXAO_LP' );

// functions.php do tema filho ou plugin próprio.
function marctco_send_lead( array $payload ) {
    $payload['schema_version'] = 'v1';
    $payload['source'] = 'LANDING_PAGE';

    return wp_remote_post( MARCTCO_LP_URL, array(
        'headers' => array(
            'Authorization' => 'Bearer ' . MARCTCO_LP_TOKEN,
            'Content-Type'  => 'application/json',
        ),
        'body'    => wp_json_encode( $payload ),
        'timeout' => 10,
    ) );
}`;

export const contactForm7Recipe = `add_action( 'wpcf7_before_send_mail', function( $form, $abort, $submission ) {
    if ( 123 !== (int) $form->id() ) {
        return;
    }

    marctco_send_lead( array(
        'name'  => $submission->get_posted_data( 'your-name' ),
        'phone' => $submission->get_posted_data( 'your-phone' ),
        'email' => $submission->get_posted_data( 'your-email' ),
        'form_id' => (string) $form->id(),
    ) );
}, 10, 3 );`;

export const wpFormsRecipe = `add_action( 'wpforms_process_complete', function( $fields, $entry, $form_data, $entry_id ) {
    if ( 123 !== (int) $form_data['id'] ) {
        return;
    }

    $payload = array(
        'name'    => $fields[1]['value'] ?? null,
        'email'   => $fields[2]['value'] ?? null,
        'phone'   => $fields[3]['value'] ?? null,
        'form_id' => (string) $form_data['id'],
    );

    if ( 0 < (int) $entry_id ) {
        $payload['external_lead_id'] = 'wpforms-' . (string) $entry_id;
    }

    marctco_send_lead( $payload );
}, 10, 4 );`;

export const elementorRecipe = `add_action( 'elementor_pro/forms/new_record', function( $record, $handler ) {
    if ( 'Simulação revisional' !== $record->get_form_settings( 'form_name' ) ) {
        return;
    }

    $raw_fields = $record->get( 'fields' );
    $fields = array();
    foreach ( $raw_fields as $id => $field ) {
        $fields[ $id ] = $field['value'];
    }

    marctco_send_lead( array(
        'name'    => $fields['name'] ?? null,
        'email'   => $fields['email'] ?? null,
        'phone'   => $fields['phone'] ?? null,
        'form_id' => $record->get_form_settings( 'form_id' ),
    ) );
}, 10, 2 );`;

export const nodeServerRecipe = `const payload = {
  schema_version: "v1",
  source: "LANDING_PAGE",
  external_lead_id: submission.id,
  name: submission.name,
  phone: submission.phone,
  email: submission.email,
};

const response = await fetch(process.env.MARCTCO_LP_URL, {
  method: "POST",
  headers: {
    authorization: "Bearer " + process.env.MARCTCO_LP_TOKEN,
    "content-type": "application/json",
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  throw new Error("O CRM recusou a submissão: " + response.status);
}`;

export const nextServerlessRecipe = `// app/api/formulario/route.ts. Esta rota roda no servidor.
export async function POST(request: Request) {
  const submission = await request.json();

  const response = await fetch(process.env.MARCTCO_LP_URL!, {
    method: "POST",
    headers: {
      authorization: "Bearer " + process.env.MARCTCO_LP_TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      schema_version: "v1",
      source: "LANDING_PAGE",
      external_lead_id: submission.id,
      name: submission.name,
      phone: submission.phone,
      email: submission.email,
    }),
  });

  return new Response(null, { status: response.ok ? 204 : 502 });
}`;

export const framerBridgeRecipe = `import { createHmac, timingSafeEqual } from "node:crypto";

function validFramerSignature(body: string, submissionId: string, signature: string) {
  const expected = "sha256=" + createHmac("sha256", process.env.FRAMER_WEBHOOK_SECRET!)
    .update(body)
    .update(submissionId)
    .digest("hex");
  const received = Buffer.from(signature);
  const calculated = Buffer.from(expected);
  return received.length === calculated.length && timingSafeEqual(received, calculated);
}

// Receba o webhook nativo do Framer nesta rota serverless.
export async function POST(request: Request) {
  const submissionId = request.headers.get("framer-webhook-submission-id");
  const signature = request.headers.get("framer-signature");
  const body = await request.text();

  if (!submissionId || !signature || !validFramerSignature(body, submissionId, signature)) {
    return new Response("Assinatura inválida", { status: 401 });
  }
  const form = JSON.parse(body);

  const response = await fetch(process.env.MARCTCO_LP_URL!, {
    method: "POST",
    headers: {
      authorization: "Bearer " + process.env.MARCTCO_LP_TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      schema_version: "v1",
      source: "LANDING_PAGE",
      external_lead_id: submissionId,
      name: form.name,
      phone: form.phone,
      email: form.email,
    }),
  });

  return new Response(null, { status: response.ok ? 200 : 502 });
}`;
