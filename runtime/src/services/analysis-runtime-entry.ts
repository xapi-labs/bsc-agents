/**
 * Serialize a TypeScript-compiled analysis factory into an isolated esbuild
 * entrypoint. tsx/esbuild may add calls to its private `__name` helper inside
 * Function#toString() output, so the serialized source must provide that helper
 * explicitly instead of relying on the build process global.
 */
export function analysisRuntimeEntry(
  decimalModulePath: string,
  factory: Function,
): string {
  return [
    `import Decimal from ${JSON.stringify(decimalModulePath)};`,
    'const __name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });',
    `export const runtime = (${factory.toString()})(Decimal);`,
  ].join('\n');
}
