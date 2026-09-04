// Not named instrumentation.d.ts: tsc drops a .d.ts that shares a basename with a .ts file
// (it would collide with and be discarded alongside instrumentation.ts).
declare module "import-in-the-middle/register-hooks.mjs" {
  export * from "import-in-the-middle/register-hooks";
}
