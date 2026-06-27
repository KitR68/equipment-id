/**
 * Equipment ID — Deterministic serial number decoder.
 *
 * For manufacturers with well-known, simple serial number date formats,
 * this module decodes the manufacture date using pure code logic — no AI.
 * This eliminates the inconsistency of LLM-based interpretation.
 *
 * When a manufacturer has a registered decoder here, it takes priority
 * over the LLM decoding step.
 */

import type { SerialDecoding } from "./openai";

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface DecoderResult {
  manufactureDate: string;
  determination: string;
  confidence: "high" | "medium" | "low";
  serialFormat: string;
  dateDecoding: string;
}

type DecoderFn = (
  serial: string,
  dateCode?: string | null,
  modelNumber?: string | null,
) => DecoderResult | null;

/**
 * Power Flame Inc — Serial format: MMYY#####
 * First 2 digits = month (01-12), next 2 digits = year (two-digit),
 * remaining digits = production sequence.
 */
function decodePowerFlame(serial: string): DecoderResult | null {
  // Must be at least 5 digits (MMYY + at least 1 sequence digit)
  const cleaned = serial.replace(/[\s-]/g, "");
  if (!/^\d{5,}$/.test(cleaned)) return null;

  const mm = parseInt(cleaned.substring(0, 2), 10);
  const yy = parseInt(cleaned.substring(2, 4), 10);

  if (mm < 1 || mm > 12) return null;

  // Convert 2-digit year: 00-49 → 2000-2049, 50-99 → 1950-1999
  const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;

  const monthName = MONTHS[mm];
  const manufactureDate = `${fullYear}-${String(mm).padStart(2, "0")}`;

  return {
    manufactureDate,
    determination: `Serial ${serial}: first two digits "${String(mm).padStart(2, "0")}" = ${monthName}, next two digits "${String(yy).padStart(2, "0")}" = ${fullYear}. Manufacture date: ${monthName} ${fullYear}.`,
    confidence: "high",
    serialFormat: `MMYY##### — First 2 digits = month (01-12), digits 3-4 = year (two-digit), remaining = production sequence.`,
    dateDecoding: `Digits 1-2 = month, digits 3-4 = year. Example: 020516266 → 02(Feb) + 05(2005) + 16266(seq) = February 2005.`,
  };
}

/**
 * Vissani / Midea — Date code format: WWYYYY_XXXXXXX
 * First 2 digits = week (01-52), next 4 digits = year,
 * underscore separator, remaining = production sequence.
 */
function decodeVissani(_serial: string, dateCode?: string | null): DecoderResult | null {
  const code = dateCode || _serial;
  if (!code) return null;

  // Match pattern: WW YYYY _ sequence
  const match = code.match(/^(\d{2})(\d{4})[_-](\d+)$/);
  if (!match) return null;

  const ww = parseInt(match[1], 10);
  const yyyy = parseInt(match[2], 10);

  if (ww < 1 || ww > 53) return null;
  if (yyyy < 1990 || yyyy > 2099) return null;

  // Approximate the month from the week number
  const approxMonth = Math.ceil(ww * 12 / 52);
  const monthName = MONTHS[approxMonth] || "";

  const manufactureDate = `Week ${ww} of ${yyyy}`;

  return {
    manufactureDate,
    determination: `Date code ${code}: first two digits "${String(ww).padStart(2, "0")}" = week ${ww}, next four digits "${yyyy}" = year ${yyyy}. This corresponds to approximately ${monthName} ${yyyy}.`,
    confidence: "high",
    serialFormat: `WWYYYY_XXXXXXX — First 2 digits = week (01-52), next 4 digits = four-digit year, underscore, then production sequence.`,
    dateDecoding: `Digits 1-2 = week number, digits 3-6 = year. Example: 402024_2009375 → week 40 of 2024 (late September/early October 2024).`,
  };
}

const A_TO_M_SKIP_I_MONTHS: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6,
  G: 7, H: 8, J: 9, K: 10, L: 11, M: 12,
};

const YORK_MONTHS: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6,
  G: 7, H: 8, K: 9, L: 10, M: 11, N: 12,
};

const GE_MONTHS: Record<string, number> = {
  A: 1, B: 2, D: 3, F: 4, G: 5, H: 6,
  L: 7, M: 8, R: 9, S: 10, T: 11, V: 12,
};

const GE_YEARS: Record<string, number[]> = {
  D: [2000, 2012, 2024],
  F: [2001, 2013, 2025],
  G: [2002, 2014],
  H: [2003, 2015],
  L: [2004, 2016],
  A: [2005, 2017],
  M: [2006, 2018],
  R: [2007, 2019],
  S: [2008, 2020],
  T: [2009, 2021],
  V: [2010, 2022],
  Z: [2011, 2023],
};

const BRADFORD_WHITE_YEARS: Record<string, number[]> = {
  A: [1984, 2004, 2024],
  B: [1985, 2005, 2025],
  C: [1986, 2006, 2026],
  D: [1987, 2007],
  E: [1988, 2008],
  F: [1989, 2009],
  G: [1990, 2010],
  H: [1991, 2011],
  J: [1992, 2012],
  K: [1993, 2013],
  L: [1994, 2014],
  M: [1995, 2015],
  N: [1996, 2016],
  P: [1997, 2017],
  S: [1998, 2018],
  T: [1999, 2019],
  W: [2000, 2020],
  X: [2001, 2021],
  Y: [2002, 2022],
  Z: [2003, 2023],
};

const SAMSUNG_YEARS: Record<string, number[]> = {
  R: [2001, 2021],
  T: [2002, 2022],
  W: [2003, 2023],
  X: [2004, 2024],
  Y: [2005, 2025],
  A: [2006],
  L: [2006],
  P: [2007],
  Q: [2008],
  S: [2009],
  Z: [2010],
  B: [2011],
  C: [2012],
  D: [2013],
  F: [2014],
  G: [2015],
  H: [2016],
  J: [2017],
  K: [2018],
  M: [2019],
  N: [2020],
};

const SAMSUNG_MONTHS: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
  "7": 7, "8": 8, "9": 9, A: 10, B: 11, C: 12,
};

const MAYTAG_YEARS: Record<string, number[]> = {
  E: [1980, 2004],
  G: [1981, 2005],
  J: [1982, 2006],
  L: [1983, 2007],
  N: [1984, 2008],
  P: [1985, 2009],
  R: [1986, 2010],
  T: [1987, 2011],
  V: [1988, 2012],
  X: [1989, 2013],
  B: [1966, 1990, 2014],
  D: [1967, 1991],
  F: [1968, 1992],
  H: [1969, 1993],
  K: [1970, 1994],
  M: [1971, 1995],
  Q: [1972, 1996],
  S: [1973, 1997],
  U: [1974, 1998],
  W: [1975, 1999],
  Y: [1976, 2000],
  Z: [1977, 2001],
  A: [1978, 2002],
  C: [1979, 2003],
};

const MAYTAG_MONTHS: Record<string, number> = {
  A: 1, B: 1,
  C: 2, D: 2,
  E: 3, F: 3,
  G: 4, H: 4,
  J: 5, K: 5,
  L: 6, M: 6,
  N: 7, Q: 7,
  P: 8, S: 8,
  R: 9, U: 9,
  T: 10, W: 10,
  V: 11, Y: 11,
  X: 12, Z: 12,
};

const WHIRLPOOL_YEARS: Record<string, number[]> = {
  K: [2000],
  L: [2001],
  M: [2002],
  P: [2003],
  R: [2004],
  S: [2005],
  T: [2006],
  U: [2007],
  W: [2008],
  Y: [2009],
  "0": [2010],
  "1": [2011],
  "2": [2012],
  "3": [2013],
  "4": [2014],
  "5": [2015],
  "6": [2016],
  "7": [2017],
  "8": [2018],
  "9": [2019],
  X: [2020],
  A: [2021],
  B: [2022],
  C: [2023],
  D: [2024],
  E: [2025],
  F: [2026],
};

function cleanAlnum(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cleanDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function validMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function validWeek(week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= 53;
}

function expandTwoDigitYear(yy: number): number {
  return yy <= 30 ? 2000 + yy : 1900 + yy;
}

function padded(value: number): string {
  return String(value).padStart(2, "0");
}

function approxMonthForWeek(week: number): number {
  return Math.min(12, Math.max(1, Math.ceil(week * 12 / 52)));
}

function formatYearList(years: number[]): string {
  const uniqueYears = Array.from(new Set(years)).sort((a, b) => a - b);
  if (uniqueYears.length === 0) return "unknown year";
  if (uniqueYears.length === 1) return String(uniqueYears[0]);
  if (uniqueYears.length === 2) return `${uniqueYears[0]} or ${uniqueYears[1]}`;
  return `${uniqueYears.slice(0, -1).join(", ")}, or ${uniqueYears[uniqueYears.length - 1]}`;
}

function possibleYearsForLastDigit(lastDigit: number, startYear: number): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = startYear; year <= currentYear; year += 1) {
    if (year % 10 === lastDigit) years.push(year);
  }
  return years;
}

function makeMonthResult(
  brand: string,
  serial: string,
  year: number,
  month: number,
  serialFormat: string,
  dateDecoding: string,
  detail: string,
  confidence: "high" | "medium" | "low" = "high",
): DecoderResult {
  const monthName = MONTHS[month];
  return {
    manufactureDate: `${year}-${padded(month)}`,
    determination: `Serial ${serial}: ${detail}. Manufacture date: ${monthName} ${year}.`,
    confidence,
    serialFormat,
    dateDecoding,
  };
}

function makeWeekResult(
  brand: string,
  serial: string,
  year: number,
  week: number,
  serialFormat: string,
  dateDecoding: string,
  detail: string,
  confidence: "high" | "medium" | "low" = "high",
): DecoderResult {
  const approxMonth = approxMonthForWeek(week);
  return {
    manufactureDate: `Week ${week} of ${year}`,
    determination: `Serial ${serial}: ${detail}. Week ${week} corresponds approximately to ${MONTHS[approxMonth]} ${year}.`,
    confidence,
    serialFormat,
    dateDecoding,
  };
}

function makeAmbiguousMonthResult(
  serial: string,
  years: number[],
  month: number,
  serialFormat: string,
  dateDecoding: string,
  detail: string,
): DecoderResult {
  const monthName = MONTHS[month];
  const yearText = formatYearList(years);
  return {
    manufactureDate: `${monthName} ${yearText}`,
    determination: `Serial ${serial}: ${detail}. Because the year code repeats by production cycle, the manufacture date is ${monthName} ${yearText}; use model era, design, or other data-plate clues to choose the exact year.`,
    confidence: "medium",
    serialFormat,
    dateDecoding,
  };
}

function decodeYyWeekPrefix(
  serial: string,
  brand: string,
  serialFormat: string,
  dateDecoding: string,
  options: { minYear?: number; exactFourDigits?: boolean } = {},
): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = options.exactFourDigits ? cleaned.match(/^(\d{2})(\d{2})$/) : cleaned.match(/^(\d{2})(\d{2})/);
  if (!match) return null;

  const yy = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const year = expandTwoDigitYear(yy);
  if (!validWeek(week)) return null;
  if (options.minYear && year < options.minYear) return null;

  return makeWeekResult(
    brand,
    serial,
    year,
    week,
    serialFormat,
    dateDecoding,
    `first two digits "${match[1]}" = ${year}; digits 3-4 "${match[2]}" = week ${week}`,
  );
}

function decodeYyMonthNumeric10(
  serial: string,
  brand: string,
  example: string,
): DecoderResult | null {
  const cleaned = cleanDigits(serial);
  if (!/^\d{10}$/.test(cleaned)) return null;

  const yy = parseInt(cleaned.substring(0, 2), 10);
  const month = parseInt(cleaned.substring(2, 4), 10);
  if (!validMonth(month)) return null;

  const year = expandTwoDigitYear(yy);
  return makeMonthResult(
    brand,
    serial,
    year,
    month,
    `10-digit numeric — first 2 digits = year, digits 3-4 = month, remaining = production sequence.`,
    `Digits 1-2 = two-digit year; digits 3-4 = month (01-12). Example: ${example}.`,
    `first two digits "${cleaned.substring(0, 2)}" = ${year}; digits 3-4 "${cleaned.substring(2, 4)}" = ${MONTHS[month]}`,
  );
}

function decodeAoSmith(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);

  const modern = decodeYyWeekPrefix(
    serial,
    "A.O. Smith",
    `Modern YYWW######## — first 2 digits = year, digits 3-4 = week, remaining = sequence.`,
    `Modern format: digits 1-2 identify the two-digit manufacture year and digits 3-4 identify the week number. Example: 2037123456 → week 37 of 2020.`,
  );
  if (modern) return modern;

  const singleLetter = cleaned.match(/^([A-HJ-M])(\d{2})/);
  if (singleLetter) {
    const month = A_TO_M_SKIP_I_MONTHS[singleLetter[1]];
    const yy = parseInt(singleLetter[2], 10);
    const year = expandTwoDigitYear(yy);
    return makeMonthResult(
      "A.O. Smith",
      serial,
      year,
      month,
      `Older letter-month format — first letter = month (A-M, skipping I), following 2 digits = year.`,
      `Older format: the leading letter maps to the month and the following two digits map to the year. Example: E07A135491 → May 2007.`,
      `first letter "${singleLetter[1]}" = ${MONTHS[month]}; following digits "${singleLetter[2]}" = ${year}`,
    );
  }

  const twoLetter = cleaned.match(/^[A-Z]([A-HJ-M])(\d{2})/);
  if (twoLetter) {
    const month = A_TO_M_SKIP_I_MONTHS[twoLetter[1]];
    const yy = parseInt(twoLetter[2], 10);
    const year = expandTwoDigitYear(yy);
    return makeMonthResult(
      "A.O. Smith",
      serial,
      year,
      month,
      `Older two-letter format — second letter = month (A-M, skipping I), following 2 digits = year.`,
      `Older format: the first letter is a plant/factory code, the second letter maps to the month, and the following two digits map to the year. Example: AF04... → June 2004.`,
      `second letter "${twoLetter[1]}" = ${MONTHS[month]}; following digits "${twoLetter[2]}" = ${year}`,
    );
  }

  return null;
}

function decodeAmana(serial: string): DecoderResult | null {
  return decodeYyMonthNumeric10(serial, "Amana", "2108317723 → August 2021");
}

function decodeGoodman(serial: string): DecoderResult | null {
  return decodeYyMonthNumeric10(serial, "Goodman", "9704011000 → April 1997");
}

function decodeSpeedQueen(serial: string): DecoderResult | null {
  return decodeYyMonthNumeric10(serial, "Speed Queen / Alliance Laundry Systems", "1112098778 → December 2011");
}

function decodeCarrierBryantPayne(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^(\d{2})(\d{2})[A-Z]\d{5}$/);
  if (!match) return null;

  const week = parseInt(match[1], 10);
  const yy = parseInt(match[2], 10);
  if (!validWeek(week)) return null;
  const year = expandTwoDigitYear(yy);

  return makeWeekResult(
    "Carrier/Bryant/Payne",
    serial,
    year,
    week,
    `Modern 10-character format — 4 digits + 1 letter + 5 digits; first 2 digits = week, digits 3-4 = year.`,
    `Modern format: digits 1-2 identify the week and digits 3-4 identify the two-digit year. Example: 4006A17330 → week 40 of 2006.`,
    `first two digits "${match[1]}" = week ${week}; digits 3-4 "${match[2]}" = ${year}`,
  );
}

function decodeLennox(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^[A-Z0-9]{2}(\d{2})([A-HJ-M])[A-Z0-9]{5}$/);
  if (!match) return null;

  const yy = parseInt(match[1], 10);
  const month = A_TO_M_SKIP_I_MONTHS[match[2]];
  if (!validMonth(month)) return null;
  const year = expandTwoDigitYear(yy);

  return makeMonthResult(
    "Lennox",
    serial,
    year,
    month,
    `10-character Lennox format — positions 3-4 = year, position 5 = month letter (A-M, skipping I).`,
    `Digits 3-4 identify the two-digit year; the 5th character maps to the month using A=January through M=December, skipping I. Example: 5899L17212 → November 1999.`,
    `digits 3-4 "${match[1]}" = ${year}; 5th character "${match[2]}" = ${MONTHS[month]}`,
  );
}

function decodeIcp(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^[A-Z](\d{2})(\d{2})\d{5}$/);
  if (!match) return null;

  const yy = parseInt(match[1], 10);
  const weekOrMonth = parseInt(match[2], 10);
  if (!validWeek(weekOrMonth)) return null;
  const year = expandTwoDigitYear(yy);
  const confidence = weekOrMonth <= 12 ? "medium" : "high";
  const qualifier = weekOrMonth <= 12
    ? `code ${weekOrMonth} can be a week code in modern ICP style and may be a month code on some older variants`
    : `code ${weekOrMonth} is above 12, so it is interpreted as week ${weekOrMonth}`;

  return makeWeekResult(
    "ICP brand",
    serial,
    year,
    weekOrMonth,
    `Letter + 9 digits — positions 2-3 = year, positions 4-5 = week/month code, remaining = sequence.`,
    `Modern ICP format used by Comfortmaker, Heil, and Tempstar: after the leading letter, the first two digits encode the year and the next two digits encode the production week. Values 01-12 may overlap older month-coded styles.`,
    `digits 2-3 "${match[1]}" = ${year}; digits 4-5 "${match[2]}" = ${qualifier}`,
    confidence,
  );
}

function decodeTrane(serial: string): DecoderResult | null {
  return decodeYyWeekPrefix(
    serial,
    "Trane",
    `Modern Trane format (2002+) — first 2 digits = year, digits 3-4 = week.`,
    `Modern format: digits 1-2 identify the two-digit year and digits 3-4 identify the production week. Example: 130313596L → week 3 of 2013.`,
    { minYear: 2002 },
  );
}

function decodeNotifier(serial: string, dateCode?: string | null): DecoderResult | null {
  const code = dateCode || serial;
  return decodeYyWeekPrefix(
    code,
    "Notifier",
    `4-digit YYWW date code — first 2 digits = year, last 2 digits = week.`,
    `Notifier date-code format: digits 1-2 identify the two-digit year and digits 3-4 identify the week. Example: 2145 → week 45 of 2021.`,
    { exactFourDigits: true },
  );
}

function decodeHoneywellSystemSensor(serial: string, dateCode?: string | null): DecoderResult | null {
  const code = dateCode || serial;
  return decodeYyWeekPrefix(
    code,
    "Honeywell / System Sensor",
    `Post-2022 4-digit YYWW date code — first 2 digits = year, last 2 digits = week.`,
    `Post-June-2022 Honeywell/System Sensor standardized format: digits 1-2 identify the two-digit year and digits 3-4 identify the week. Example: 2223 → week 23 of 2022.`,
    { minYear: 2022, exactFourDigits: true },
  );
}

function decodeStateIndustries(serial: string): DecoderResult | null {
  return decodeYyWeekPrefix(
    serial,
    "State Industries / State Water Heaters",
    `YYWW######## — first 2 digits = year, digits 3-4 = week, remaining = sequence.`,
    `Modern State Industries/State Water Heaters format: digits 1-2 identify the two-digit year and digits 3-4 identify the week. Example: 2339135877683 → week 39 of 2023.`,
  );
}

function decodeRheemRuud(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^[A-Z]+(\d{2})(\d{2})/);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const yy = parseInt(match[2], 10);
  if (!validMonth(month)) return null;
  const year = expandTwoDigitYear(yy);

  return makeMonthResult(
    "Rheem/Ruud",
    serial,
    year,
    month,
    `Common water-heater format — letter prefix followed by MMYY and remaining sequence characters.`,
    `After the leading letter prefix, the first two digits identify the month and the next two digits identify the two-digit year. Example: R0408B10488 → April 2008.`,
    `after the letter prefix, digits "${match[1]}" = ${MONTHS[month]}; next digits "${match[2]}" = ${year}`,
  );
}

function decodeLg(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^(\d)(\d{2})/);
  if (!match) return null;

  const lastDigit = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (!validMonth(month)) return null;

  const years = possibleYearsForLastDigit(lastDigit, 2000);
  if (years.length === 0) return null;

  return makeAmbiguousMonthResult(
    serial,
    years,
    month,
    `LG date prefix — first digit = last digit of year, digits 2-3 = month.`,
    `LG appliance format: the first digit identifies the last digit of the manufacture year and digits 2-3 identify the month. Example: 903KRNQ00000 → March 2009 or 2019.`,
    `first digit "${match[1]}" = a year ending in ${lastDigit}; digits 2-3 "${match[2]}" = ${MONTHS[month]}`,
  );
}

function decodeSamsung(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  let yearCode: string | undefined;
  let monthCode: string | undefined;
  let positionText: string;

  if (cleaned.length === 15) {
    yearCode = cleaned[7];
    monthCode = cleaned[8];
    positionText = "8th character = year code; 9th character = month code";
  } else if (cleaned.length === 11) {
    yearCode = cleaned[3];
    monthCode = cleaned[4];
    positionText = "4th character = year code; 5th character = month code";
  } else {
    return null;
  }

  const years = SAMSUNG_YEARS[yearCode];
  const month = SAMSUNG_MONTHS[monthCode];
  if (!years || !validMonth(month)) return null;

  return makeAmbiguousMonthResult(
    serial,
    years,
    month,
    `Samsung 11- or 15-character date-code format — ${positionText}.`,
    `For 15-character serials, position 8 is the year code and position 9 is the month code. For 11-character serials, position 4 is the year code and position 5 is the month code. Month codes 1-9 = January-September, A=October, B=November, C=December.`,
    `${positionText}; year code "${yearCode}" = ${formatYearList(years)}; month code "${monthCode}" = ${MONTHS[month]}`,
  );
}

function decodeGe(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^([A-Z])([A-Z])/);
  if (!match) return null;

  const month = GE_MONTHS[match[1]];
  const years = GE_YEARS[match[2]];
  if (!validMonth(month) || !years) return null;

  return makeAmbiguousMonthResult(
    serial,
    years,
    month,
    `GE two-letter date prefix — character 1 = month code, character 2 = cyclic year code.`,
    `GE Appliances date code: first character maps to the month (A=Jan, B=Feb, D=Mar, F=Apr, G=May, H=Jun, L=Jul, M=Aug, R=Sep, S=Oct, T=Nov, V=Dec); second character maps to a repeating year cycle.`,
    `first character "${match[1]}" = ${MONTHS[month]}; second character "${match[2]}" = ${formatYearList(years)}`,
  );
}

function decodePeerlessBoilers(serial: string): DecoderResult | null {
  const cleaned = serial.toUpperCase().replace(/\s/g, "");
  const sixDigit = cleaned.match(/-(\d{4})(\d{2})$/);
  if (sixDigit) {
    const year = parseInt(sixDigit[1], 10);
    const month = parseInt(sixDigit[2], 10);
    if (year < 2000 || year > 2099 || !validMonth(month)) return null;
    return makeMonthResult(
      "Peerless Boilers",
      serial,
      year,
      month,
      `Six-digit post-hyphen date code — YYYYMM after the hyphen for 2000+ units.`,
      `For Peerless Boilers made from 2000 onward, the digits after the hyphen are YYYYMM. Example: 123456-201003 → March 2010.`,
      `after the hyphen, digits "${sixDigit[1]}" = ${year}; digits "${sixDigit[2]}" = ${MONTHS[month]}`,
    );
  }

  const fourDigit = cleaned.match(/-(\d{2})(\d{2})$/);
  if (!fourDigit) return null;
  const month = parseInt(fourDigit[1], 10);
  const yy = parseInt(fourDigit[2], 10);
  if (!validMonth(month) || yy < 84 || yy > 99) return null;
  const year = 1900 + yy;
  return makeMonthResult(
    "Peerless Boilers",
    serial,
    year,
    month,
    `Four-digit post-hyphen date code — MMYY after the hyphen for 1984-1999 units.`,
    `For Peerless Boilers made from 1984 through 1999, the digits after the hyphen are MMYY. Example: 123456-1284 → December 1984.`,
    `after the hyphen, digits "${fourDigit[1]}" = ${MONTHS[month]}; digits "${fourDigit[2]}" = ${year}`,
  );
}

function decodePeerlessPremier(serial: string): DecoderResult | null {
  const match = serial.trim().match(/\/\s*(\d{2})(\d{2})\s*$/);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const yy = parseInt(match[2], 10);
  if (!validMonth(month)) return null;
  const year = expandTwoDigitYear(yy);

  return makeMonthResult(
    "Peerless Premier",
    serial,
    year,
    month,
    `XXXXXX/MMYY — date code appears after the slash; first two post-slash digits = month, next two = year.`,
    `After the slash, digits 1-2 identify the month and digits 3-4 identify the two-digit year. Example: 123456/0422 → April 2022.`,
    `after the slash, digits "${match[1]}" = ${MONTHS[month]}; digits "${match[2]}" = ${year}`,
  );
}

function decodeFrigidaireElectrolux(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^[A-Z]{2}(\d)(\d{2})\d{5}$/);
  if (!match) return null;

  const lastDigit = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  if (!validWeek(week)) return null;

  const years = possibleYearsForLastDigit(lastDigit, 1986);
  if (years.length === 0) return null;
  const approxMonth = approxMonthForWeek(week);
  const yearText = formatYearList(years);
  return {
    manufactureDate: `Week ${week} of ${yearText}`,
    determination: `Serial ${serial}: the first two letters are plant/product codes; 3rd character "${match[1]}" = a year ending in ${lastDigit}; characters 4-5 "${match[2]}" = week ${week}. Week ${week} is approximately ${MONTHS[approxMonth]}. Because the year digit repeats by decade, possible years are ${yearText}; use model era or data-plate clues to choose the exact year.`,
    confidence: "medium",
    serialFormat: `10-character Frigidaire/Electrolux format — two letters followed by eight digits; character 3 = last digit of year, characters 4-5 = week.`,
    dateDecoding: `Modern Frigidaire/Electrolux format: characters 1-2 identify facility/product; character 3 identifies the last digit of the year; characters 4-5 identify the week. Example: LA81503430 → week 15 of a year ending in 8.`,
  };
}

function decodeBradfordWhite(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^([A-Z])([A-HJ-M])/);
  if (!match) return null;

  const years = BRADFORD_WHITE_YEARS[match[1]];
  const month = A_TO_M_SKIP_I_MONTHS[match[2]];
  if (!years || !validMonth(month)) return null;

  return makeAmbiguousMonthResult(
    serial,
    years,
    month,
    `Two-letter Bradford White prefix — first letter = 20-year cyclic year code, second letter = month code.`,
    `Bradford White format: the first letter maps to a repeating 20-year production cycle and the second letter maps to the month using A=January through M=December, skipping I. Example: DG6322957 → July 1987 or July 2007.`,
    `first letter "${match[1]}" = ${formatYearList(years)}; second letter "${match[2]}" = ${MONTHS[month]}`,
  );
}

function decodeKidde(serial: string): DecoderResult | null {
  const cleaned = cleanDigits(serial);
  if (!/^\d{10}$/.test(cleaned)) return null;

  const dayOfYear = parseInt(cleaned.substring(4, 7), 10);
  const yy = parseInt(cleaned.substring(7, 9), 10);
  if (dayOfYear < 1 || dayOfYear > 366) return null;
  const year = expandTwoDigitYear(yy);

  const date = new Date(Date.UTC(year, 0, dayOfYear));
  if (date.getUTCFullYear() !== year) return null;

  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const manufactureDate = `${year}-${padded(month)}-${padded(day)}`;

  return {
    manufactureDate,
    determination: `Serial/date code ${serial}: digits 5-9 are "${cleaned.substring(4, 9)}" in DDDYY format. "${cleaned.substring(4, 7)}" = day ${dayOfYear} of the year and "${cleaned.substring(7, 9)}" = ${year}, which is ${MONTHS[month]} ${day}, ${year}.`,
    confidence: "high",
    serialFormat: `10-digit Kidde fire-extinguisher code — digits 5-9 = DDDYY Julian date code.`,
    dateDecoding: `Digits 5-7 identify the Julian day of year and digits 8-9 identify the two-digit year. Example: 1205322062 → 32206 → 322nd day of 2006.`,
  };
}

function decodeAmericanStandard(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);

  const modern = cleaned.match(/^(\d{2})(\d{2})[A-Z0-9]{5,}$/);
  if (modern) {
    const yy = parseInt(modern[1], 10);
    const week = parseInt(modern[2], 10);
    const year = 2000 + yy;
    if (year >= 2010 && validWeek(week)) {
      return makeWeekResult(
        "American Standard",
        serial,
        year,
        week,
        `Modern American Standard format (2010+) — first 2 digits = year, digits 3-4 = week.`,
        `For 2010+ American Standard serials, digits 1-2 identify the two-digit year and digits 3-4 identify the week. Example: 142345678 → week 23 of 2014.`,
        `first two digits "${modern[1]}" = ${year}; digits 3-4 "${modern[2]}" = week ${week}`,
      );
    }
  }

  const transitional = cleaned.match(/^([2-9])(\d{2})[A-Z0-9]{6,}$/);
  if (!transitional) return null;
  const year = 2000 + parseInt(transitional[1], 10);
  const week = parseInt(transitional[2], 10);
  if (year < 2002 || year > 2009 || !validWeek(week)) return null;

  return makeWeekResult(
    "American Standard",
    serial,
    year,
    week,
    `American Standard 2002-2009 format — first digit = year, digits 2-3 = week.`,
    `For 2002-2009 American Standard serials, character 1 identifies the year and characters 2-3 identify the week. Example: 7165RHAIG → week 16 of 2007.`,
    `first digit "${transitional[1]}" = ${year}; digits 2-3 "${transitional[2]}" = week ${week}`,
  );
}

function decodeWhirlpool(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  let yearCode: string;
  let weekText: string;
  let positionText: string;

  if (/^[A-Z0-9]{9}$/.test(cleaned)) {
    yearCode = cleaned[1];
    weekText = cleaned.substring(2, 4);
    positionText = "2nd character = year code; characters 3-4 = week";
  } else if (/^[A-Z0-9]{10}$/.test(cleaned)) {
    yearCode = cleaned[2];
    weekText = cleaned.substring(3, 5);
    positionText = "3rd character = year code; characters 4-5 = week";
  } else {
    return null;
  }

  const years = WHIRLPOOL_YEARS[yearCode];
  const week = parseInt(weekText, 10);
  if (!years || !validWeek(week)) return null;

  const approxMonth = approxMonthForWeek(week);
  const yearText = formatYearList(years);
  return {
    manufactureDate: `Week ${week} of ${yearText}`,
    determination: `Serial ${serial}: ${positionText}. Year code "${yearCode}" = ${yearText}; week code "${weekText}" = week ${week}, approximately ${MONTHS[approxMonth]}. Use model era if a year code is reused by later production cycles.`,
    confidence: yearCode.match(/^\d$/) ? "high" : "medium",
    serialFormat: `Whirlpool 9- or 10-character format — year code plus two-digit week code.`,
    dateDecoding: `For common 9-character Whirlpool appliance serials, character 2 is the year code and characters 3-4 are the week. For 10-character serials, character 3 is the year code and characters 4-5 are the week. Example: CR3949348 → R=2004, week 39.`,
  };
}

function decodeMaytag(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^[A-Z0-9]{8}([A-Z])([A-Z])$/);
  if (!match) return null;

  const years = MAYTAG_YEARS[match[1]];
  const month = MAYTAG_MONTHS[match[2]];
  if (!years || !validMonth(month)) return null;

  return makeAmbiguousMonthResult(
    serial,
    years,
    month,
    `Maytag 10-character format ending in two letters — second-to-last letter = year code, last letter = month code.`,
    `Maytag legacy format: the first of the two trailing letters identifies the year in a 24-year cycle, and the second trailing letter identifies the month. Month code pairs are A/B=Jan, C/D=Feb, E/F=Mar, G/H=Apr, J/K=May, L/M=Jun, N/Q=Jul, P/S=Aug, R/U=Sep, T/W=Oct, V/Y=Nov, X/Z=Dec.`,
    `second-to-last letter "${match[1]}" = ${formatYearList(years)}; last letter "${match[2]}" = ${MONTHS[month]}`,
  );
}

function decodeYork(serial: string): DecoderResult | null {
  const cleaned = cleanAlnum(serial);
  const match = cleaned.match(/^[A-Z](\d)([A-HK-N])(\d)\d{6}$/);
  if (!match) return null;

  const year = 2000 + parseInt(`${match[1]}${match[3]}`, 10);
  const month = YORK_MONTHS[match[2]];
  if (!validMonth(month)) return null;
  if (year < 2004 || (year === 2004 && month < 10)) return null;

  return makeMonthResult(
    "York",
    serial,
    year,
    month,
    `Modern York format (Oct. 2004+) — character 2 and character 4 combine to form the year; character 3 is the month letter.`,
    `For modern York serials, combine the 2nd and 4th characters for the two-digit year and use the 3rd character for the month (A=Jan, B=Feb, C=Mar, D=Apr, E=May, F=Jun, G=Jul, H=Aug, K=Sep, L=Oct, M=Nov, N=Dec). Example: W0F6123456 → June 2006.`,
    `characters 2 and 4 "${match[1]}${match[3]}" = ${year}; character 3 "${match[2]}" = ${MONTHS[month]}`,
  );
}

function decodeKenmore(serial: string, dateCode?: string | null, modelNumber?: string | null): DecoderResult | null {
  if (!modelNumber) return null;
  const modelPrefix = modelNumber.trim().match(/^(\d{3})/);
  if (!modelPrefix) return null;

  const prefix = modelPrefix[1];
  let underlying: string | null = null;
  let result: DecoderResult | null = null;

  if (["106", "110", "664", "665"].includes(prefix)) {
    underlying = "Whirlpool";
    result = decodeWhirlpool(serial);
  } else if (["253", "417", "628", "790"].includes(prefix)) {
    underlying = "Frigidaire/Electrolux";
    result = decodeFrigidaireElectrolux(serial);
  } else if (prefix === "363") {
    underlying = "GE Appliances";
    result = decodeGe(serial);
  } else if (["721", "795", "796"].includes(prefix)) {
    underlying = "LG Electronics";
    result = decodeLg(serial);
  } else if (prefix === "402") {
    underlying = "Samsung";
    result = decodeSamsung(serial);
  }

  if (!underlying || !result) return null;

  return {
    ...result,
    determination: `Kenmore model prefix ${prefix} indicates ${underlying}-built equipment. ${result.determination}`,
    serialFormat: `Kenmore model prefix ${prefix} (${underlying}-built): ${result.serialFormat}`,
    dateDecoding: `Kenmore uses the model prefix to identify the underlying manufacturer. Prefix ${prefix} maps to ${underlying}. ${result.dateDecoding}`,
  };
}

/**
 * SuperStor / PVI Industries — date is on the nameplate as MM/YY in a "Date" field.
 * Serial format: [Letter][DD][Letter][NNNN] e.g. J08K1546
 * The Date field (MM/YY) is the primary source. If no dateCode is provided,
 * fall back to serial: first letter = month (A=Jan..L=Dec), digits 2-3 = year.
 */
function decodeSuperStor(serial: string, dateCode?: string | null): DecoderResult | null {
  // Primary: use dateCode field if present (format: MM/YY)
  if (dateCode) {
    const dcMatch = dateCode.trim().match(/^(\d{1,2})\/(\d{2})$/);
    if (dcMatch) {
      const month = parseInt(dcMatch[1], 10);
      const yy = parseInt(dcMatch[2], 10);
      if (validMonth(month)) {
        const year = expandTwoDigitYear(yy);
        return makeMonthResult(
          "SuperStor (PVI Industries)",
          serial,
          year,
          month,
          `Date field on nameplate shows MM/YY format.`,
          `The "Date" field on the nameplate directly encodes the manufacture date as MM/YY.`,
          `Date field "${dateCode}" = ${MONTHS[month]} ${year}`,
        );
      }
    }
  }

  // Fallback: serial format [Letter][DD][Letter][NNNN]
  const cleaned = serial.trim().toUpperCase();
  const match = cleaned.match(/^([A-L])(\d{2})[A-Z](\d{4})$/);
  if (!match) return null;

  const monthLetter = match[1].charCodeAt(0) - 64; // A=1, B=2, ..., L=12
  const yy = parseInt(match[2], 10);
  if (!validMonth(monthLetter)) return null;
  const year = expandTwoDigitYear(yy);

  return makeMonthResult(
    "SuperStor (PVI Industries)",
    serial,
    year,
    monthLetter,
    `[Letter][YY][Letter][NNNN] — first letter = month (A=Jan..L=Dec), digits 2-3 = year.`,
    `First letter encodes month (A=January through L=December), next two digits encode year.`,
    `letter "${match[1]}" = ${MONTHS[monthLetter]}; digits "${match[2]}" = ${year}`,
  );
}

/**
 * Registry of deterministic decoders.
 * Each entry has a list of keywords — if ALL keywords in any entry
 * are found in the normalized manufacturer name, that decoder is used.
 */
const DECODER_RULES: Array<{ keywords: string[]; decoder: DecoderFn }> = [
  { keywords: ["power", "flame"], decoder: decodePowerFlame },
  { keywords: ["vissani"], decoder: decodeVissani },
  { keywords: ["midea"], decoder: decodeVissani },
  { keywords: ["peerless", "premier"], decoder: decodePeerlessPremier },
  { keywords: ["ao", "smith"], decoder: decodeAoSmith },
  { keywords: ["aosmith"], decoder: decodeAoSmith },
  { keywords: ["amana"], decoder: decodeAmana },
  { keywords: ["american", "standard"], decoder: decodeAmericanStandard },
  { keywords: ["carrier"], decoder: decodeCarrierBryantPayne },
  { keywords: ["bryant"], decoder: decodeCarrierBryantPayne },
  { keywords: ["payne"], decoder: decodeCarrierBryantPayne },
  { keywords: ["goodman"], decoder: decodeGoodman },
  { keywords: ["lennox"], decoder: decodeLennox },
  { keywords: ["comfortmaker"], decoder: decodeIcp },
  { keywords: ["heil"], decoder: decodeIcp },
  { keywords: ["tempstar"], decoder: decodeIcp },
  { keywords: ["trane"], decoder: decodeTrane },
  { keywords: ["notifier"], decoder: decodeNotifier },
  { keywords: ["honeywell"], decoder: decodeHoneywellSystemSensor },
  { keywords: ["system", "sensor"], decoder: decodeHoneywellSystemSensor },
  { keywords: ["state", "industries"], decoder: decodeStateIndustries },
  { keywords: ["state", "water"], decoder: decodeStateIndustries },
  { keywords: ["rheem"], decoder: decodeRheemRuud },
  { keywords: ["ruud"], decoder: decodeRheemRuud },
  { keywords: ["lg"], decoder: decodeLg },
  { keywords: ["samsung"], decoder: decodeSamsung },
  { keywords: ["ge", "appliance"], decoder: decodeGe },
  { keywords: ["general", "electric"], decoder: decodeGe },
  { keywords: ["ge"], decoder: decodeGe },
  { keywords: ["peerless", "boiler"], decoder: decodePeerlessBoilers },
  { keywords: ["speed", "queen"], decoder: decodeSpeedQueen },
  { keywords: ["alliance", "laundry"], decoder: decodeSpeedQueen },
  { keywords: ["frigidaire"], decoder: decodeFrigidaireElectrolux },
  { keywords: ["electrolux"], decoder: decodeFrigidaireElectrolux },
  { keywords: ["bradford", "white"], decoder: decodeBradfordWhite },
  { keywords: ["kidde"], decoder: decodeKidde },
  { keywords: ["york"], decoder: decodeYork },
  { keywords: ["whirlpool"], decoder: decodeWhirlpool },
  { keywords: ["maytag"], decoder: decodeMaytag },
  { keywords: ["kenmore"], decoder: decodeKenmore },
  { keywords: ["superstor"], decoder: decodeSuperStor },
  { keywords: ["super", "stor"], decoder: decodeSuperStor },
  { keywords: ["pvi"], decoder: decodeSuperStor },
];

/**
 * Normalize a manufacturer name for matching: lowercase, strip punctuation,
 * collapse whitespace.
 */
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // remove all punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Attempt a deterministic (code-based) decode for a given manufacturer.
 * Returns a full SerialDecoding if successful, or null if no decoder
 * is registered or the serial doesn't match the expected pattern.
 */
export function deterministicDecode(
  manufacturer: string,
  serialNumber: string,
  dateCode?: string | null,
  modelNumber?: string | null,
): SerialDecoding | null {
  const normalized = normalizeForMatch(manufacturer);

  // Find a matching decoder by checking if all keywords appear in the name
  let matchedDecoder: DecoderFn | null = null;
  for (const rule of DECODER_RULES) {
    if (rule.keywords.every((kw) => normalized.includes(kw))) {
      matchedDecoder = rule.decoder;
      break;
    }
  }

  if (!matchedDecoder) return null;

  const result = matchedDecoder(serialNumber, dateCode, modelNumber);
  if (!result) return null;

  return {
    ...result,
    modelFormat: undefined,
    sources: ["Deterministic decoder (programmatic)"],
    manualUrl: null,
  };
}
