/**
 * Expanded test corpus for 4-target transfer experiment.
 * Tests harder edge cases that stress emit backends.
 */
export const STRESS_PROGRAMS = [
  // Type annotations
  { lin: '@LIN:L1c:0.2\n^schema_once\n!add(a:$num,b:$num):$num{^(a+b)}\n=ex{add}', desc: 'typed params' },
  { lin: '@LIN:L1c:0.2\n^schema_once\n!f():$bool{^(true)}\n=ex{f}', desc: 'typed return' },
  // Multiple assigns
  { lin: '@LIN:L1c:0.2\n^schema_once\n!swap(a,b){t=a;a=b;b=t;^(a)}\n=ex{swap}', desc: 'swap with temp' },
  // Complex expressions
  { lin: '@LIN:L1c:0.2\n^schema_once\n!calc(a,b){r=a*b+a-b;^(r)}\n=ex{calc}', desc: 'compound expr' },
  // For with break
  { lin: '@LIN:L1c:0.2\n^schema_once\n!find(arr,target){#(i=0;i<arr.length;i++){?(arr[i]==target){^(i)}};^(-1)}\n=ex{find}', desc: 'for with early return' },
  // Nested if-else
  { lin: '@LIN:L1c:0.2\n^schema_once\n!min3(a,b,c){?(a<b){?(a<c){^(a)}:{};^(c)}:{};?(b<c){^(b)}:{};^(c)}\n=ex{min3}', desc: 'min3 nested' },
  // While with guard
  { lin: '@LIN:L1c:0.2\n^schema_once\n!divmod(a,b){r=a;#(i=0;i<b;i++){r=r-b};^(r)}\n=ex{divmod}', desc: 'modulus via while' },
  // Multiple return points
  { lin: '@LIN:L1c:0.2\n^schema_once\n!sign(x){?(x>0){^(1)}:{};?(x<0){^(-1)}:{};^(0)}\n=ex{sign}', desc: 'multi return' },
  // Empty function
  { lin: '@LIN:L1c:0.2\n^schema_once\n!noop(){}\n=ex{noop}', desc: 'empty fn' },
  // Single expression
  { lin: '@LIN:L1c:0.2\n^schema_once\n!inc(x){^(x+1)}\n=ex{inc}', desc: 'single expr' },
  // Nested for loops
  { lin: '@LIN:L1c:0.2\n^schema_once\n!dot(a,b){s=0;#(i=0;i<a.length;i++){s=s+a[i]*b[i]};^(s)}\n=ex{dot}', desc: 'dot product' },
  // Recursive with multiple args
  { lin: '@LIN:L1c:0.2\n^schema_once\n!gcd(a,b){?(b==0){^(a)}:{};^(gcd(b,a%b))}\n=ex{gcd}', desc: 'gcd recursive' },
  // Chained comparisons
  { lin: '@LIN:L1c:0.2\n^schema_once\n!inrange(x,lo,hi){?(x>=lo){?(x<=hi){^(true)}:{};^(false)}:{};^(false)}\n=ex{inrange}', desc: 'chained cmp' },
  // String concat
  { lin: '@LIN:L1c:0.2\n^schema_once\n!greeting(first,last){^(first+" "+last)}\n=ex{greeting}', desc: 'string concat' },
  // For with string building
  { lin: '@LIN:L1c:0.2\n^schema_once\n!star(n){s="";#(i=0;i<n;i++){s=s+"*"};^(s)}\n=ex{star}', desc: 'star builder' },
];

export const CONSTANT_TABLE_PROGRAMS = [
  { lin: '@LIN:L1c:0.2\n^schema_once\n$K{b=1 kb=1024}\n!f(){^(kb)}\n=ex{f}', desc: 'KB constant' },
  { lin: '@LIN:L1c:0.2\n^schema_once\n$K{pi=3.14}\n!f(){^(pi)}\n=ex{f}', desc: 'float constant' },
  { lin: '@LIN:L1c:0.2\n^schema_once\n$K{msg="hello"}\n!f(){^(msg)}\n=ex{f}', desc: 'string constant' },
];

export const COMPLEX_CONTROL_PROGRAMS = [
  // Deeply nested
  { lin: '@LIN:L1c:0.2\n^schema_once\n!deep(a){?(a>0){?(a>1){?(a>2){^(3)}:{};^(2)}:{};^(1)}:{};^(0)}\n=ex{deep}', desc: 'triple nested' },
  // Nested loops
  { lin: '@LIN:L1c:0.2\n^schema_once\n!count(n){c=0;#(i=0;i<n;i++){#(j=0;j<n;j++){c=c+1}};^(c)}\n=ex{count}', desc: 'nested loop' },
  // If inside for
  { lin: '@LIN:L1c:0.2\n^schema_once\n!even_sum(n){s=0;#(i=0;i<n;i++){?(i%2==0){s=s+i}};^(s)}\n=ex{even_sum}', desc: 'if inside for' },
  // For with multiple if
  { lin: '@LIN:L1c:0.2\n^schema_once\n!classify(arr){pos=0;neg=0;#(i=0;i<arr.length;i++){?(arr[i]>0){pos=pos+1}:{};?(arr[i]<0){neg=neg+1}};^(pos)}\n=ex{classify}', desc: 'multi if in for' },
  // Recursive fibonacci
  { lin: '@LIN:L1c:0.2\n^schema_once\n!fib(n){?(n<=1){^(n)}:{};^(fib(n-1)+fib(n-2))}\n=ex{fib}', desc: 'fib recursive' },
  // Tail recursion
  { lin: '@LIN:L1c:0.2\n^schema_once\n!fact_tail(n,acc){?(n<=1){^(acc)}:{};^(fact_tail(n-1,n*acc))}\n=ex{fact_tail}', desc: 'tail recursive' },
];
