import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildSync } from 'esbuild';

export const PI_WORKER_ENGINE = {
  name: 'pi-agent-core',
  package: '@earendil-works/pi-agent-core',
  version: '0.85.1',
} as const;

// Cache only immutable library code in the publisher, never invocation state.
let bundledCore: string | undefined;

export function buildPiWorkerCore(): string {
  if (bundledCore === undefined) {
    const agentPackageDir = dirname(
      require.resolve('@earendil-works/pi-agent-core/package.json'),
    );
    // Resolve the exact pi-ai peer installed beside this pinned agent-core.
    // Its package exposes ESM import conditions only, so require.resolve on the
    // package root is not portable across Jest/CommonJS and production builds.
    const aiDistDir = join(agentPackageDir, '../pi-ai/dist');
    const agentLoopPath = join(agentPackageDir, 'dist/agent-loop.js');
    const eventStreamPath = join(aiDistDir, 'utils/event-stream.js');
    const validationPath = join(aiDistDir, 'utils/validation.js');
    const rootImport =
      'import { EventStream, validateToolArguments, } from "@earendil-works/pi-ai";';
    const agentLoopSource = readFileSync(agentLoopPath, 'utf8');
    if (!agentLoopSource.includes(rootImport)) {
      throw new Error(
        `Pinned ${PI_WORKER_ENGINE.name} ${PI_WORKER_ENGINE.version} entry contract changed`,
      );
    }
    // The package root re-exports its optional Node harness and file/shell tools.
    // Bundle only the pinned loop plus the two Pi AI utilities it actually uses.
    const workerEntry = `${agentLoopSource.replace(
      rootImport,
      [
        `import { EventStream, AssistantMessageEventStream } from ${JSON.stringify(eventStreamPath)};`,
        `import { validateToolArguments } from ${JSON.stringify(validationPath)};`,
      ].join('\n'),
    )}\nexport { AssistantMessageEventStream };`;
    // Resolve from the installed production dependency, not the source checkout.
    // This also works in the Docker runner (dist/ + production node_modules).
    bundledCore = buildSync({
      stdin: {
        contents: workerEntry,
        resolveDir: dirname(agentLoopPath),
        sourcefile: 'xapi-pi-core.mjs',
      },
      bundle: true,
      platform: 'browser',
      target: 'es2022',
      format: 'iife',
      globalName: 'XAPI_PI',
      minify: true,
      write: false,
    }).outputFiles[0].text;
  }
  return bundledCore;
}
