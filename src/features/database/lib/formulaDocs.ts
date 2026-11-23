/**
 * What every formula function does, in one place. This one table feeds the autocomplete list, the hint that
 * shows the current argument while typing, and the reference panel, so they can never disagree.
 * A test checks that every function the engine has is described here.
 */

export type FormulaCategory = 'Text' | 'Number' | 'Logic' | 'Date' | 'List' | 'Record';

export interface FunctionDoc {
  name: string;
  category: FormulaCategory;
  /** Arguments as typed, optional ones in square brackets: `ROUND(value, [places])`. */
  signature: string;
  description: string;
  example: string;
}

const doc = (name: string, category: FormulaCategory, signature: string, description: string, example: string): FunctionDoc => ({
  name,
  category,
  signature,
  description,
  example,
});

export const FUNCTION_DOCS: readonly FunctionDoc[] = [
  // Text
  doc('CONCATENATE', 'Text', 'CONCATENATE(text1, [text2, ...])', 'Joins values into one piece of text.', 'CONCATENATE({First}, " ", {Last})'),
  doc('CONCAT', 'Text', 'CONCAT(text1, [text2, ...])', 'Joins values into one piece of text (same as CONCATENATE).', 'CONCAT({First}, {Last})'),
  doc('LEFT', 'Text', 'LEFT(text, count)', 'The first characters of the text.', 'LEFT("Invoice", 3) gives "Inv"'),
  doc('RIGHT', 'Text', 'RIGHT(text, count)', 'The last characters of the text.', 'RIGHT("Invoice", 4) gives "oice"'),
  doc('MID', 'Text', 'MID(text, start, count)', 'Characters from the middle, counting from 1.', 'MID("Invoice", 2, 3) gives "nvo"'),
  doc('LEN', 'Text', 'LEN(text)', 'How many characters the text has.', 'LEN({Name})'),
  doc('TRIM', 'Text', 'TRIM(text)', 'Removes spaces from both ends.', 'TRIM("  hi  ") gives "hi"'),
  doc('UPPER', 'Text', 'UPPER(text)', 'Turns the text into capital letters.', 'UPPER("abc") gives "ABC"'),
  doc('LOWER', 'Text', 'LOWER(text)', 'Turns the text into small letters.', 'LOWER("ABC") gives "abc"'),
  doc('REPLACE', 'Text', 'REPLACE(text, start, count, replacement)', 'Replaces part of the text, found by position.', 'REPLACE("Hello", 1, 1, "J") gives "Jello"'),
  doc('SUBSTITUTE', 'Text', 'SUBSTITUTE(text, old, new, [which])', 'Replaces matching text. Give a number to change only that match.', 'SUBSTITUTE("a-b-c", "-", "/") gives "a/b/c"'),
  doc('SEARCH', 'Text', 'SEARCH(find, text, [start])', 'Position of the first match ignoring capitals, or 0 when not found.', 'SEARCH("inv", "Invoice") gives 1'),
  doc('FIND', 'Text', 'FIND(find, text, [start])', 'Position of the first match respecting capitals, or 0 when not found.', 'FIND("B", "abcb") gives 0'),
  doc('REPEAT', 'Text', 'REPEAT(text, count)', 'Repeats the text.', 'REPEAT("ab", 2) gives "abab"'),
  doc('REPT', 'Text', 'REPT(text, count)', 'Repeats the text (same as REPEAT).', 'REPT("*", 5) gives "*****"'),
  doc('T', 'Text', 'T(value)', 'The value if it is text, otherwise empty.', 'T({Notes})'),
  doc('REGEX_MATCH', 'Text', 'REGEX_MATCH(text, pattern)', 'True when the text matches the pattern.', 'REGEX_MATCH({Code}, "^[A-Z]{3}-[0-9]+$")'),
  doc('REGEX_EXTRACT', 'Text', 'REGEX_EXTRACT(text, pattern)', 'The first part of the text that matches the pattern.', 'REGEX_EXTRACT("Order 4521", "[0-9]+") gives "4521"'),
  doc('REGEX_REPLACE', 'Text', 'REGEX_REPLACE(text, pattern, replacement)', 'Replaces every part that matches the pattern.', 'REGEX_REPLACE({Phone}, "[^0-9]", "")'),
  doc('ENCODE_URL_COMPONENT', 'Text', 'ENCODE_URL_COMPONENT(text)', 'Makes text safe to put inside a web address.', 'ENCODE_URL_COMPONENT("a b&c")'),

  // Number
  doc('ABS', 'Number', 'ABS(number)', 'The number without its sign.', 'ABS(-4) gives 4'),
  doc('CEIL', 'Number', 'CEIL(number)', 'Rounds up to the next whole number.', 'CEIL(2.1) gives 3'),
  doc('CEILING', 'Number', 'CEILING(number, [step])', 'Rounds up, to a multiple of the step if you give one.', 'CEILING(7, 5) gives 10'),
  doc('FLOOR', 'Number', 'FLOOR(number)', 'Rounds down to the whole number below.', 'FLOOR(2.9) gives 2'),
  doc('ROUND', 'Number', 'ROUND(number, [places])', 'Rounds to the nearest value, with that many decimal places.', 'ROUND(2.456, 2) gives 2.46'),
  doc('ROUNDUP', 'Number', 'ROUNDUP(number, [places])', 'Rounds away from zero.', 'ROUNDUP(2.11, 1) gives 2.2'),
  doc('ROUNDDOWN', 'Number', 'ROUNDDOWN(number, [places])', 'Rounds toward zero.', 'ROUNDDOWN(2.99, 1) gives 2.9'),
  doc('INT', 'Number', 'INT(number)', 'Rounds down to a whole number.', 'INT(-2.5) gives -3'),
  doc('SIGN', 'Number', 'SIGN(number)', '1 for a positive number, -1 for a negative one, 0 for zero.', 'SIGN(-4) gives -1'),
  doc('SQRT', 'Number', 'SQRT(number)', 'Square root.', 'SQRT(16) gives 4'),
  doc('POWER', 'Number', 'POWER(base, exponent)', 'The base raised to the exponent.', 'POWER(2, 3) gives 8'),
  doc('MOD', 'Number', 'MOD(number, divisor)', 'The remainder after dividing.', 'MOD(10, 3) gives 1'),
  doc('EXP', 'Number', 'EXP(number)', 'e raised to the number.', 'EXP(1)'),
  doc('LOG', 'Number', 'LOG(number, [base])', 'Logarithm, natural unless you give a base.', 'LOG(100, 10) gives 2'),
  doc('EVEN', 'Number', 'EVEN(number)', 'The smallest even whole number that is not less than the value.', 'EVEN(3) gives 4'),
  doc('ODD', 'Number', 'ODD(number)', 'The smallest odd whole number that is not less than the value.', 'ODD(2) gives 3'),
  doc('MIN', 'Number', 'MIN(number1, [number2, ...])', 'The smallest value.', 'MIN({A}, {B})'),
  doc('MAX', 'Number', 'MAX(number1, [number2, ...])', 'The largest value.', 'MAX({A}, {B})'),
  doc('SUM', 'Number', 'SUM(number1, [number2, ...])', 'Adds the values.', 'SUM({Price}, {Tax})'),
  doc('AVERAGE', 'Number', 'AVERAGE(number1, [number2, ...])', 'The mean of the values; empty ones are ignored.', 'AVERAGE(2, 4, 6) gives 4'),
  doc('COUNT', 'Number', 'COUNT(value1, [value2, ...])', 'How many of the values are numbers.', 'COUNT("a", 1, 2) gives 2'),
  doc('COUNTA', 'Number', 'COUNTA(value1, [value2, ...])', 'How many of the values are not empty.', 'COUNTA({A}, {B}, {C})'),
  doc('COUNTALL', 'Number', 'COUNTALL(value1, [value2, ...])', 'How many values there are, empty ones included.', 'COUNTALL({A}, {B})'),
  doc('COUNTBLANK', 'Number', 'COUNTBLANK(value1, [value2, ...])', 'How many of the values are empty.', 'COUNTBLANK({A}, {B}, {C})'),
  doc('VALUE', 'Number', 'VALUE(text)', 'Turns text such as "₦1,200" or "12%" into a number.', 'VALUE("₦2,000") gives 2000'),

  // Logic
  doc('IF', 'Logic', 'IF(condition, then, [otherwise])', 'One result when the condition is true, another when it is not. Only the branch used is worked out.', 'IF({Paid}, "Paid", "Due")'),
  doc('SWITCH', 'Logic', 'SWITCH(value, match1, result1, [match2, result2, ...], [default])', 'Picks the result for the first match, or the default.', 'SWITCH({Status}, "A", 1, "B", 2, 0)'),
  doc('AND', 'Logic', 'AND(condition1, [condition2, ...])', 'True when every condition is true. Same as &&.', 'AND({Paid}, {Amount} > 100)'),
  doc('OR', 'Logic', 'OR(condition1, [condition2, ...])', 'True when any condition is true. Same as ||.', 'OR({Late}, {Disputed})'),
  doc('XOR', 'Logic', 'XOR(condition1, [condition2, ...])', 'True when an odd number of conditions are true.', 'XOR({A}, {B})'),
  doc('NOT', 'Logic', 'NOT(condition)', 'Flips true and false. Same as !.', 'NOT({Archived})'),
  doc('TRUE', 'Logic', 'TRUE()', 'The value true.', 'TRUE()'),
  doc('FALSE', 'Logic', 'FALSE()', 'The value false.', 'FALSE()'),
  doc('BLANK', 'Logic', 'BLANK()', 'An empty value.', 'IF({Amount} > 0, {Amount}, BLANK())'),
  doc('ISBLANK', 'Logic', 'ISBLANK(value)', 'True when the value is empty.', 'ISBLANK({Notes})'),
  doc('ISERROR', 'Logic', 'ISERROR(value)', 'True when working out the value fails or gives an error.', 'ISERROR({Amount} / {Count})'),
  doc('ERROR', 'Logic', 'ERROR([message])', 'Gives an error you choose; ISERROR can see it.', 'IF({Qty} < 0, ERROR("Negative quantity"), {Qty})'),

  // Date
  doc('NOW', 'Date', 'NOW()', 'The current date and time.', 'DATETIME_DIFF(NOW(), {Created}, "days")'),
  doc('TODAY', 'Date', 'TODAY()', 'Today\'s date.', 'IS_BEFORE({Due}, TODAY())'),
  doc('DATEADD', 'Date', 'DATEADD(date, amount, unit)', 'Adds days, weeks, months or years to a date.', 'DATEADD({Start}, 30, "days")'),
  doc('DATEDIFF', 'Date', 'DATEDIFF(from, to, [unit])', 'How long it is from the first date to the second (positive when the second is later).', 'DATEDIFF({Start}, {End}, "days")'),
  doc('DATETIME_DIFF', 'Date', 'DATETIME_DIFF(later, earlier, [unit])', 'The first date or time minus the second (positive when the first is later).', 'DATETIME_DIFF({End}, {Start}, "hours")'),
  doc('DATETIME_FORMAT', 'Date', 'DATETIME_FORMAT(date, format)', 'Shows a date in a format such as YYYY-MM-DD.', 'DATETIME_FORMAT({Date}, "DD/MM/YYYY")'),
  doc('DATETIME_PARSE', 'Date', 'DATETIME_PARSE(text, [format])', 'Turns text into a date.', 'DATETIME_PARSE("2026-11-23")'),
  doc('DATESTR', 'Date', 'DATESTR(date)', 'The date part as YYYY-MM-DD.', 'DATESTR({Created})'),
  doc('TIMESTR', 'Date', 'TIMESTR(date)', 'The time part as HH:mm:ss.', 'TIMESTR({Created})'),
  doc('YEAR', 'Date', 'YEAR(date)', 'The year.', 'YEAR({Date})'),
  doc('MONTH', 'Date', 'MONTH(date)', 'The month, 1 to 12.', 'MONTH({Date})'),
  doc('DAY', 'Date', 'DAY(date)', 'The day of the month.', 'DAY({Date})'),
  doc('HOUR', 'Date', 'HOUR(date)', 'The hour, 0 to 23.', 'HOUR({Created})'),
  doc('MINUTE', 'Date', 'MINUTE(date)', 'The minute.', 'MINUTE({Created})'),
  doc('SECOND', 'Date', 'SECOND(date)', 'The second.', 'SECOND({Created})'),
  doc('WEEKDAY', 'Date', 'WEEKDAY(date)', 'The day of the week as a number.', 'WEEKDAY({Date})'),
  doc('WEEKNUM', 'Date', 'WEEKNUM(date)', 'The week of the year.', 'WEEKNUM({Date})'),
  doc('WORKDAY', 'Date', 'WORKDAY(date, days)', 'The date after that many working days (no weekends).', 'WORKDAY({Start}, 10)'),
  doc('WORKDAY_DIFF', 'Date', 'WORKDAY_DIFF(date1, date2)', 'How many working days lie between two dates.', 'WORKDAY_DIFF({Start}, {End})'),
  doc('IS_AFTER', 'Date', 'IS_AFTER(date1, date2)', 'True when the first date is later.', 'IS_AFTER({Due}, TODAY())'),
  doc('IS_BEFORE', 'Date', 'IS_BEFORE(date1, date2)', 'True when the first date is earlier.', 'IS_BEFORE({Due}, TODAY())'),
  doc('IS_SAME', 'Date', 'IS_SAME(date1, date2, [unit])', 'True when both dates fall in the same day, month or year.', 'IS_SAME({A}, {B}, "month")'),

  // List
  doc('ARRAYJOIN', 'List', 'ARRAYJOIN(list, [separator])', 'Joins the items of a list into text.', 'ARRAYJOIN({Tags}, " | ")'),
  doc('ARRAYUNIQUE', 'List', 'ARRAYUNIQUE(list)', 'The list without repeated items.', 'ARRAYUNIQUE({Tags})'),
  doc('ARRAYCOMPACT', 'List', 'ARRAYCOMPACT(list)', 'The list without empty items.', 'ARRAYCOMPACT({Tags})'),
  doc('ARRAYFLATTEN', 'List', 'ARRAYFLATTEN(list)', 'Lists inside a list become one list.', 'ARRAYFLATTEN({Tags})'),
  doc('ARRAYSLICE', 'List', 'ARRAYSLICE(list, start, [end])', 'Part of a list, counting from 0, the end not included.', 'ARRAYSLICE({Tags}, 0, 2)'),

  // Record
  doc('RECORD_ID', 'Record', 'RECORD_ID()', 'The unique id of this row.', 'RECORD_ID()'),
  doc('CREATED_TIME', 'Record', 'CREATED_TIME()', 'When this row was created.', 'DATETIME_FORMAT(CREATED_TIME(), "YYYY-MM-DD")'),
  doc('LAST_MODIFIED_TIME', 'Record', 'LAST_MODIFIED_TIME()', 'When this row was last changed.', 'LAST_MODIFIED_TIME()'),
];

const BY_NAME = new Map(FUNCTION_DOCS.map((d) => [d.name, d]));

/** The documentation for a function, by name in any letter case. */
export function functionDoc(name: string): FunctionDoc | undefined {
  return BY_NAME.get(name.toUpperCase());
}

export const FORMULA_CATEGORIES: readonly FormulaCategory[] = ['Text', 'Number', 'Logic', 'Date', 'List', 'Record'];

/** Functions grouped by category, optionally narrowed by a search over name, description and signature. */
export function searchFunctionDocs(query = ''): Array<{ category: FormulaCategory; items: FunctionDoc[] }> {
  const q = query.trim().toLowerCase();
  const matches = (d: FunctionDoc) =>
    q === '' || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.signature.toLowerCase().includes(q);
  return FORMULA_CATEGORIES.map((category) => ({
    category,
    items: FUNCTION_DOCS.filter((d) => d.category === category && matches(d)).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0);
}
