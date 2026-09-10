import { buildSync } from 'esbuild';
import { dirname } from 'node:path';
import { createHealthAnalysisRuntime } from './health-analysis-runtime';
import { analysisRuntimeEntry } from './analysis-runtime-entry';

let bundled: string | undefined;
export function buildHealthWorkerCore(): string {
  // Serialize the compiled, self-contained factory, so a dist-only production
  // image does not need the TypeScript source checkout to publish a Worker.
  return (bundled ??= buildSync({
    stdin: {
      contents: analysisRuntimeEntry(
        require.resolve('decimal.js'),
        createHealthAnalysisRuntime,
      ),
      sourcefile: 'health-analysis.mjs',
      resolveDir: dirname(require.resolve('decimal.js')),
    },
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
    globalName: 'XAPI_HEALTH',
    minify: true,
    write: false,
  }).outputFiles[0].text);
}
