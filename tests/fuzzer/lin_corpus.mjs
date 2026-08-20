/**
 * LIN Language Adversarial Corpus
 * 
 * Permanent collection of syntactic traps organized by:
 * - character class (reserved, operator, delimiter, etc.)
 * - context (identifier, string, char, expression, type, etc.)
 * - expected behavior (pass, reject, semantic change)
 */
export const RESERVED_CHARS = [
  '$', '$K', '@', '#', '%', '\\', '/', ':', ';',
  '!', '?', '^', '_', '~', '&', '|', '+', '-',
  '*', '<', '>', '{', '}', '(', ')', '[', ']',
  ',', '.', '=', '\n', '\t', '\r',
];

export const QUOTED_LITERALS = [
  // These MUST be treated as string contents, never as LIN tokens
  { input: "'$'", desc: 'dollar in single quotes', expect: 'string_literal' },
  { input: '"$"', desc: 'dollar in double quotes', expect: 'string_literal' },
  { input: "'$K'", desc: '$K in single quotes', expect: 'string_literal' },
  { input: '"$K"', desc: '$K in double quotes', expect: 'string_literal' },
  { input: "'#'", desc: 'hash in single quotes', expect: 'string_literal' },
  { input: '"#"', desc: 'hash in double quotes', expect: 'string_literal' },
  { input: "'@LIN'", desc: 'header in single quotes', expect: 'string_literal' },
  { input: '"!f(){}"', desc: 'function syntax in double quotes', expect: 'string_literal' },
  { input: "'^(x+1)'", desc: 'return sigil in single quotes', expect: 'string_literal' },
  { input: '"?=if #=for"', desc: 'sigil config in double quotes', expect: 'string_literal' },
  { input: "'\\$'", desc: 'escaped dollar in single quotes', expect: 'string_literal' },
  { input: '"\\n"', desc: 'escaped newline in double quotes', expect: 'string_literal' },
  { input: "'\\t\\r'", desc: 'escaped tabs/carriage return', expect: 'string_literal' },
  { input: "'$K{b=1}'", desc: 'full constant decl in quotes', expect: 'string_literal' },
];

export const IDENTIFIER_TRAPS = [
  // $ in identifier names
  { input: '$foo', desc: 'dollar-prefixed identifier' },
  { input: 'foo$', desc: 'dollar-suffixed identifier' },
  { input: 'foo$bar', desc: 'dollar-middled identifier' },
  { input: '_$x', desc: 'underscore-dollar identifier' },
  // Reserved word fragments
  { input: 'if_', desc: 'if with underscore' },
  { input: '_if', desc: 'underscore if' },
  { input: 'returnX', desc: 'return prefix' },
  { input: 'else_if', desc: 'else_if compound' },
  // Unicode
  { input: 'café', desc: 'unicode identifier' },
  { input: '_var', desc: 'underscore start' },
  { input: '$K', desc: 'bare $K as identifier' },
];

export const OPERATOR_TRAPS = [
  { input: 'a === b', desc: 'triple equals' },
  { input: 'a !== b', desc: 'triple not-equals' },
  { input: 'a == b', desc: 'double equals' },
  { input: 'a != b', desc: 'not equals' },
  { input: 'a && b', desc: 'logical and' },
  { input: 'a || b', desc: 'logical or' },
  { input: 'a ?? b', desc: 'nullish coalescing' },
  { input: 'a ?.b', desc: 'optional chaining' },
  { input: 'a ... b', desc: 'spread operator' },
  { input: 'a => b', desc: 'arrow function' },
];

export const NESTING_TRAPS = [
  { input: '!f(){?(a){?(b){?(c){^(1)}}}}', desc: 'triple nested if', expect: 'parse_ok' },
  { input: '!f(){#(i=0;i<3;i++){#(j=0;j<3;j++){#(k=0;k<3;k++){^(1)}}}}', desc: 'triple nested for', expect: 'parse_ok' },
  { input: '!f(){#(i=0;i<3;i++){?(i>1){#(j=0;j<i;j++){^(j)}}}}', desc: 'for inside if inside for', expect: 'parse_ok' },
  { input: '!f(){?(a){#(i=0;i<n;i++){?(b){^1}}}:{}', desc: 'if-for-if chain', expect: 'parse_ok' },
];

export const STRING_EDGE_CASES = [
  { input: "!f(){s='hello'}", desc: 'simple single-quoted string', expect: 'parse_ok' },
  { input: '!f(){s="hello"}', desc: 'simple double-quoted string', expect: 'parse_ok' },
  { input: "!f(){s='it\\'s'}", desc: 'escaped quote in string', expect: 'parse_ok' },
  { input: '!f(){s="a+b"}', desc: 'operators inside string', expect: 'parse_ok' },
  { input: "!f(){s='!f(){}'}", desc: 'function syntax inside string', expect: 'parse_ok' },
  { input: "!f(){s='#(i=0;i<10;i++)'}", desc: 'for-loop syntax inside string', expect: 'parse_ok' },
  { input: "!f(){s='^(return)'}", desc: 'return syntax inside string', expect: 'parse_ok' },
  { input: "!f(){s='?=if #=for'}", desc: 'sigil config inside string', expect: 'parse_ok' },
  { input: "!f(){s='$K{b=1}'}", desc: 'constant table inside string', expect: 'parse_ok' },
  { input: "!f(){s='@LIN:L1c:0.2'}", desc: 'header inside string', expect: 'parse_ok' },
  { input: '!f(){s="ch==\'\\$\'"}', desc: 'dollar in nested quotes in string', expect: 'parse_ok' },
];

export const TYPE_ANNOTATION_TRAPS = [
  { input: '!f(a:$){^(a)}', desc: 'dollar in type annotation', expect: 'parse_ok' },
  { input: '!f(a:{}):{}{^(a)}', desc: 'empty object type', expect: 'parse_ok' },
  { input: '!f(a:int):int{^(a)}', desc: 'typed int', expect: 'parse_ok' },
  { input: '!f(a:str|num){^(a)}', desc: 'union type', expect: 'parse_ok' },
];

export const CONST_TABLE_TRAPS = [
  { input: '$K{b=1 kb=1024}', desc: 'basic constant table', expect: 'parse_ok' },
  { input: "$K{msg='hello'}", desc: 'string constant', expect: 'parse_ok' },
  { input: "$K{flag=true n=42}", desc: 'mixed constant types', expect: 'parse_ok' },
];

// Minimal LIN programs for grammar fuzzing seeds
export const MINIMAL_PROGRAMS = [
  '@LIN:L1c:0.2\n^schema_once\n!f(){^(1)}\n=ex{f}',
  '@LIN:L1c:0.2\n^schema_once\n!add(a,b){^(a+b)}\n=ex{add}',
  '@LIN:L1c:0.2\n^schema_once\n?(@debug){!(console.log("debug"))}:{}\n!f(){^(1)}\n=ex{f}',
  '@LIN:L1c:0.2\n^schema_once\n$K{b=1 kb=1024}\n!f(){^(kb)}\n=ex{f}',
  '@LIN:L1c:0.2\n^schema_once\n!greet(name){s="Hello "+name;^(s)}\n=ex{greet}',
  '@LIN:L1c:0.2\n^schema_once\n!fact(n){?(n<=1){^(1)}:{};^(n*fact(n-1))}\n=ex{fact}',
  '@LIN:L1c:0.2\n^schema_once\n!sum(arr){total=0;#(i=0;i<arr.length;i++){total=total+arr[i]};^(total)}\n=ex{sum}',
  '@LIN:L1c:0.2\n^schema_once\n!fib(n){?(n<=1){^(n)}:{};^(fib(n-1)+fib(n-2))}\n=ex{fib}',
  '@LIN:L1c:0.2\n^schema_once\n!clamp(x,lo,hi){?(x<lo){^(lo)}:{};?(x>hi){^(hi)}:{};^(x)}\n=ex{clamp}',
  '@LIN:L1c:0.2\n^schema_once\n!abs(x){?(x<0){^(0-x)}:{};^(x)}\n=ex{abs}',
];

// Expected oracle values for minimal programs
export const ORACLE = {
  'f()': 1,
  'add(2,3)': 5,
  'greet("World")': 'Hello World',
  'fact(5)': 120,
  'sum([1,2,3,4,5])': 15,
  'fib(10)': 55,
  'clamp(5,0,10)': 5,
  'clamp(-1,0,10)': 0,
  'clamp(15,0,10)': 10,
  'abs(5)': 5,
  'abs(-5)': 5,
  'abs(0)': 0,
};
