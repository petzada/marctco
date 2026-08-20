import { parseWhatsAppFetchInstancesPayload, type WhatsAppPairingState } from "@marctco/domain";
import type { WhatsMiauClient } from "./whatsmiau-client";

export interface PersistedWhatsAppInstanceReconciliation {
  readonly present: boolean;
  readonly pairing_state: WhatsAppPairingState | null;
}

/**
 * Reconciles the persisted `instance_name` against the account list from
 * `GET /instance/fetchInstances`. Does not replace polling via
 * `connectionState/:name`; it only answers whether the provider still knows
 * this instance and what state the list reports.
 */
export async function reconcilePersistedWhatsAppInstance(input: {
  readonly client: WhatsMiauClient;
  readonly persisted_instance_name: string;
}): Promise<PersistedWhatsAppInstanceReconciliation> {
  const payload = await input.client.fetchInstances();
  const instances = parseWhatsAppFetchInstancesPayload(payload);
  const match = instances.find(
    (instance) => instance.instance_name === input.persisted_instance_name
  );
  if (!match) {
    return { present: false, pairing_state: null };
  }
  return { present: true, pairing_state: match.pairing_state };
}
