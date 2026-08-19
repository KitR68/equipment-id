import { deterministicDecode } from "../client/src/lib/deterministicDecode";

type TestCase = {
  manufacturer: string;
  serial: string;
  expectedDate: string | null;
  description: string;
};

const cases: TestCase[] = [
  {
    manufacturer: "Bosch Thermotechnik",
    serial: "3540-112-000001-T111M01973",
    expectedDate: "2011-12",
    description: "Style 1 decodes YMM from positions 5-7",
  },
  {
    manufacturer: "Bosch Thermotechnik GmbH",
    serial: "2940-455-00015-7735003001",
    expectedDate: null,
    description: "Style 1 rejects a YMM code whose month is outside 01-12",
  },
  {
    manufacturer: "Buderus",
    serial: "253000-09070-00002-5030062",
    expectedDate: "2009-03-11",
    description: "Style 2 converts 2009 Julian day 070",
  },
  {
    manufacturer: "Bosch Boilers",
    serial: "253000-08065-00040-77470007354",
    expectedDate: "2008-03-05",
    description: "Style 2 converts leap-year 2008 Julian day 065",
  },
  {
    manufacturer: "Buderus",
    serial: "253000-27070-00002-5030062",
    expectedDate: "1927-03-11",
    description: "Style 2 reinterprets a future two-digit year as the prior century",
  },
  {
    manufacturer: "Bosch Thermotechnik",
    serial: "399A-760-000051-3498752683",
    expectedDate: null,
    description: "Rejects an invalid Style 1 month rather than producing an incorrect date",
  },
];

let failed = 0;
for (const testCase of cases) {
  const result = deterministicDecode(testCase.manufacturer, testCase.serial);
  const actual = result?.manufactureDate ?? null;
  if (actual !== testCase.expectedDate) {
    console.error(`FAIL: ${testCase.description}. Expected ${testCase.expectedDate}, received ${actual}.`);
    failed += 1;
    continue;
  }

  if (actual && /^\d{4}-\d{2}(?:-\d{2})?$/.test(actual)) {
    const decoded = new Date(`${actual}T00:00:00.000Z`);
    if (decoded.getTime() > Date.now()) {
      console.error(`FAIL: ${testCase.description}. Received a future date: ${actual}.`);
      failed += 1;
      continue;
    }
  }

  console.log(`PASS: ${testCase.description} (${actual ?? "no decode"})`);
}

if (failed > 0) {
  process.exitCode = 1;
}
