FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/db/prisma packages/db/prisma
# The whole package, not just its package.json, and before the install: the
# root `postinstall` runs `pnpm --filter @marctco/domain build`, which needs
# this package's tsconfig and sources. With only the manifest here, the install
# fails with `TS5058: The specified path does not exist: 'tsconfig.build.json'`
# — which is what broke every deploy from tickets 04-06 onward while CI stayed
# green, because CI installs into a full checkout.
#
# The cost is that a change to packages/domain invalidates the dependency
# layer. That is the right trade: the package is small and changes less often
# than apps/web, and the alternative — `--ignore-scripts` — would also skip the
# lifecycle scripts that esbuild, sharp and the Prisma engines need.
COPY packages/domain packages/domain
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/db packages/db
RUN pnpm --filter @marctco/db generate && pnpm --filter @marctco/domain build && pnpm --filter @marctco/db build && pnpm --filter @marctco/web build
# The runtime copies /app/node_modules whole, so the dev dependencies ship with
# it and this image is around 1.5 GB. `pnpm prune --prod` is NOT the fix: it
# refuses to run without a TTY because it removes and reinstalls the modules
# directory, which would take the Prisma client generated two lines above with
# it — and that failure would surface on the first query in production, not
# here. Shrinking this needs `pnpm deploy --filter @marctco/web --prod` building
# a self-contained tree, which is a change worth its own testing pass.

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV MARCTCO_NEXT_STANDALONE=true
RUN corepack enable
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /app/packages/domain/dist ./packages/domain/dist
# The server entry loads packages/domain/dist directly — Next bundling the
# package into its own chunks is not enough, because instrumentation runs
# outside those chunks. So the package's node_modules is needed, and with it
# the store the symlinks point at: pnpm links into node_modules/.pnpm, and the
# only /app/node_modules the standalone output provides is Next's own file
# trace, which does not include it. Copying the package's node_modules alone
# would leave dangling symlinks — worse than nothing, because they look
# installed and fail on the first request instead of at boot.
#
# packages/domain had no dependencies at all until the `v1` contract arrived
# with zod and libphonenumber-js, which is why none of this was needed before.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/domain/node_modules ./packages/domain/node_modules
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/node_modules ./packages/db/node_modules
EXPOSE 3000
CMD ["node", "apps/web/dist/start.js"]
