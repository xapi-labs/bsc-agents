# Agent image — SHIPPED BY `bag init`, ONE Dockerfile for BOTH deploy clouds.
#
# Why a custom image: the managed Node runtimes ship only the project's own
# bundle, and every signing / on-chain intent for a twak wallet shells out to
# the `twak` CLI (npm @trustwallet/cli), which must be installed globally in
# the image. `bag deploy` hands this file to the pinned bnbagent-deploy,
# which builds the image locally with Docker and pushes it to the target
# cloud's registry (ECR for AgentCore, ACR for Azure Foundry).
#
# Arch is NOT pinned here: each deploy provider pins it on the build command
# (`--platform linux/arm64` for AgentCore, `--platform linux/amd64` for
# Foundry), so the same Dockerfile cross-builds for either cloud. Keep this
# file classic-builder compatible: no `# syntax=` directive and no
# BuildKit-only instructions (`RUN --mount=...`), so a plain `docker build`
# works everywhere.
FROM public.ecr.aws/docker/library/node:22-slim

# The pinned twak CLI.
#
# ARCH WARNING: `npm install` MUST run with this image's own node (as below).
# Installing on the host (or any other arch) and COPYing node_modules in
# breaks at runtime: twak's `@napi-rs/keyring` native binding is selected at
# install time per-arch (known npm optional-deps bug) — an x64-installed tree
# crashes under arm64 node. Multi-arch images must install per-arch too.
RUN npm install -g @trustwallet/cli@0.20.0 pnpm@10.24.0 \
 && npm cache clean --force

WORKDIR /app
# Install deps first (layer cache), then build. The lockfile is copied when
# present; a project without one falls back to a plain install.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY vendor ./vendor
RUN pnpm install

COPY . .
RUN pnpm build

# Runtime deps only in the final tree (drops typescript etc.).
RUN pnpm prune --prod

# Hosted-runtime port contracts (the unified entrypoint binds BOTH 9000 and
# 8088 itself; AGENT_PORT only prepends a primary override):
#   AgentCore A2A → 0.0.0.0:9000 at /        MCP → 0.0.0.0:8000/mcp
#   Foundry invocations/responses → 0.0.0.0:8088
# `bag init` renders 9000 / dist/unifiedMain.js from the selected
# protocol. (dist/unifiedMain.js is the BUILT entrypoint, e.g. dist/unifiedMain.js.)
ENV AGENT_PORT=9000
EXPOSE 9000
CMD ["node", "dist/unifiedMain.js"]
