/**
 * Run with: npx tsx lib/__tests__/attributes.test.ts
 */
import { formatAttributeValue, parseAttributes } from "../attributes";

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓  ${label}`);
    passed += 1;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       received: ${JSON.stringify(actual)}`);
    failed += 1;
  }
}

const rooms = { bedrooms: 2, bathrooms: 2, sqft: 850 };

expect("object", parseAttributes(rooms), rooms);
expect("one encoding", parseAttributes(JSON.stringify(rooms)), rooms);
expect(
  "double encoding",
  parseAttributes(JSON.stringify(JSON.stringify(rooms))),
  rooms,
);
expect("empty string", parseAttributes(""), {});
expect("invalid", parseAttributes("{"), {});
expect("array", parseAttributes("[1,2]"), {});
expect("null", parseAttributes(null), {});
expect("number value", formatAttributeValue(2), "2");
expect("empty value", formatAttributeValue(""), "");

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
