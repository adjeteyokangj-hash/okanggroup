/**
 * Hard-fail unless the configured Supabase project is OkangGroup R1.
 * Use before any CLI migration or remote DB command.
 */
const EXPECTED = 'prbgsnxpwyepdggdysnt';
const fromEnv = process.env.SUPABASE_PROJECT_REF ?? process.env.SUPABASE_PROJECT_ID;
const fromArg = process.argv[2];
const ref = fromArg || fromEnv;

if (!ref) {
  console.error(
    `Missing project ref. Expected ${EXPECTED}. Set SUPABASE_PROJECT_REF or pass as argv.`,
  );
  process.exit(1);
}

if (ref !== EXPECTED) {
  console.error(`Refusing operation: project ref "${ref}" is not ${EXPECTED}.`);
  process.exit(2);
}

console.log(`Supabase project target OK: ${EXPECTED}`);
