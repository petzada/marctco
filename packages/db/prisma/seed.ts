import { defaultCommercialPipeline } from "@marctco/domain";
import { PrismaClient } from "@prisma/client";
import { generateIntegrationToken } from "../src/integration-connection.js";

const DEVELOPMENT_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const DEVELOPMENT_WORKSPACE_SLUG = "11111111-1111-4111-8111-111111111112";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const revealed_tokens: Array<{ provider: "PLUGA" | "LANDING_PAGE"; token: string }> = [];
  await prisma.$transaction(async (transaction) => {
    await transaction.workspace.upsert({
      where: { id: DEVELOPMENT_WORKSPACE_ID },
      update: {},
      create: {
        id: DEVELOPMENT_WORKSPACE_ID,
        slug: DEVELOPMENT_WORKSPACE_SLUG,
        name: "Assessoria de desenvolvimento"
      }
    });

    const existing_default = await transaction.pipeline.findFirst({
      where: {
        workspace_id: DEVELOPMENT_WORKSPACE_ID,
        type: "COMMERCIAL",
        is_default: true
      },
      select: { id: true }
    });
    const default_pipeline = existing_default
      ? existing_default
      : await transaction.pipeline.create({
          data: {
            workspace_id: DEVELOPMENT_WORKSPACE_ID,
            name: defaultCommercialPipeline.name,
            type: defaultCommercialPipeline.type,
            is_default: defaultCommercialPipeline.is_default,
            stages: {
              create: defaultCommercialPipeline.stages.map((stage) => ({
                label: stage.label,
                position: stage.position,
                role: stage.role
              }))
            }
          },
          select: { id: true }
        });

    for (const provider of ["PLUGA", "LANDING_PAGE"] as const) {
      const existing_connection = await transaction.integrationConnection.findUnique({
        where: {
          workspace_id_provider: {
            workspace_id: DEVELOPMENT_WORKSPACE_ID,
            provider
          }
        },
        select: { id: true }
      });
      if (existing_connection) {
        continue;
      }

      const generated = generateIntegrationToken();
      await transaction.integrationConnection.create({
        data: {
          workspace_id: DEVELOPMENT_WORKSPACE_ID,
          provider,
          token_hash: generated.token_hash,
          token_last4: generated.token_last4,
          target_pipeline_id: default_pipeline.id
        }
      });
      revealed_tokens.push({ provider, token: generated.token });
    }
  });

  // This is the sole development-time reveal, immediately after generation.
  // The seed never persists or sends these values to the application logger.
  for (const revealed of revealed_tokens) {
    process.stdout.write(
      `Development ${revealed.provider} integration token (shown once): ${revealed.token}\n`
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
