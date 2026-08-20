/**
 * Language Acquisition Queue
 * Candidates ordered by paradigm distance from existing 16 targets.
 * Status: pending → selected → generating → testing → fixing → auditing → certified | rejected
 */
export const QUEUE = [
  {
    id: 'basic',
    name: 'BASIC',
    paradigm: ['imperative', 'line-numbered'],
    distance: 9,
    types: { numeric: 'Single', string: 'String', bool: 'Integer' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '%': 'Mod', '==': '=', '!=': '<>', '<': '<', '>': '>', '<=': '<=', '>=': '>=', '&&': 'And', '||': 'Or', '!': 'Not', '+': '+' },
    controlFlow: { if: 'IF...THEN...ELSE', for: 'FOR...NEXT', while: 'WHILE...WEND', return: 'RETURN' },
    functions: 'DEF FN / SUB',
    notes: 'Line numbers, GOTO, minimal types, no nesting',
    status: 'pending',
    attempt: 0,
    lastError: null,
  },
  {
    id: 'pascal',
    name: 'Pascal',
    paradigm: ['imperative', 'strong-static'],
    distance: 8,
    types: { numeric: 'Integer', string: 'String', bool: 'Boolean' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '%': 'mod', '==': '=', '!=': '<>', '<': '<', '>': '>', '<=': '<=', '>=': '>=', '&&': 'and', '||': 'or', '!': 'not' },
    controlFlow: { if: 'if...then...else', for: 'for...to...do', while: 'while...do', return: 'exit' },
    functions: 'function / procedure',
    notes: 'begin/end blocks, strong typing, var/const',
    status: 'pending',
    attempt: 0,
    lastError: null,
  },
  {
    id: 'forth',
    name: 'Forth',
    paradigm: ['concatenative', 'stack-based'],
    distance: 10,
    types: { numeric: '( n -- )', string: '"', bool: 'f' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '%': 'mod', '==': '=', '!=': '<>', '<': '<', '>': '>' },
    controlFlow: { if: 'IF...ELSE...THEN', for: 'DO...LOOP', while: 'BEGIN...WHILE...REPEAT', return: 'EXIT' },
    functions: ': name ... ;',
    notes: 'No variables, stack manipulation, dictionary-based',
    status: 'pending',
    attempt: 0,
    lastError: null,
  },
  {
    id: 'prolog',
    name: 'Prolog',
    paradigm: ['logic', 'declarative'],
    distance: 10,
    types: { numeric: 'number', string: 'atom', bool: 'true/false' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '==': '==', '!=': '\\==', '<': '<', '>': '>' },
    controlFlow: { if: '( Cond -> Then ; Else )', for: 'forall', while: '( repeat, fail )', return: '' },
    functions: 'head :- body.',
    notes: 'Unification, backtracking, pattern matching via clauses',
    status: 'pending',
    attempt: 0,
    lastError: null,
  },
  {
    id: 'ada',
    name: 'Ada',
    paradigm: ['imperative', 'strong-static', 'contract-based'],
    distance: 7,
    types: { numeric: 'Integer', string: 'String', bool: 'Boolean' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '%': 'mod', '==': '=', '!=': '/=', '<': '<', '>': '>', '<=': '<=', '>=': '>=' },
    controlFlow: { if: 'if...then...elsif...else...end if', for: 'for...loop', while: 'while...loop', return: 'return' },
    functions: 'function / procedure',
    notes: 'Packages, records, strong typing, contracts (pre/post)',
    status: 'pending',
    attempt: 0,
    lastError: null,
  },
  {
    id: 'scheme',
    name: 'Scheme',
    paradigm: ['functional', 'homoiconic'],
    distance: 8,
    types: { numeric: 'number', string: 'string', bool: '#t/#f' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '==': '=', '!=': 'not=', '<': '<', '>': '>' },
    controlFlow: { if: '(if cond then else)', for: '(do ((i 0)) ...)', while: '(let loop () ...)', return: '(values ...)' },
    functions: '(define (name args) body)',
    notes: 'Macros, first-class continuations, homoiconicity',
    status: 'pending',
    attempt: 0,
    lastError: null,
  },
  {
    id: 'fortran',
    name: 'Fortran',
    paradigm: ['imperative', 'array-oriented', 'scientific'],
    distance: 6,
    types: { numeric: 'integer', string: 'character(*)', bool: 'logical' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '%': 'mod', '==': '==', '!=': '/=', '<': '<', '>': '>' },
    controlFlow: { if: 'if...then...else...end if', for: 'do i = start, end', while: 'do while (cond)', return: 'return' },
    functions: 'function / subroutine',
    notes: 'Array operations, FORMAT, MODULE, derived types',
    status: 'pending',
    attempt: 0,
    lastError: null,
  },
  {
    id: 'cobol',
    name: 'COBOL',
    paradigm: ['imperative', 'data-oriented', 'verbose'],
    distance: 9,
    types: { numeric: 'PIC 9(5)', string: 'PIC X(20)', bool: 'PIC 1' },
    operators: { '+': '+', '-': '-', '*': '*', '/': '/', '==': '=', '!=': 'NOT =', '<': '<', '>': '>' },
    controlFlow: { if: 'IF...THEN...ELSE...END-IF', for: 'PERFORM VARYING', while: 'PERFORM UNTIL', return: 'EXIT' },
    functions: 'PROCEDURE DIVISION',
    notes: 'Divisions, paragraphs, sentences, RECORDS, verb-noun syntax',
    status: 'pending',
    attempt: 0,
    lastError: null,
  },
];

export const CERTIFIED = [];
export const REJECTED = [];

export function getNextCandidate() {
  return QUEUE.find(c => c.status === 'pending');
}

export function updateStatus(id, status, error = null) {
  const c = QUEUE.find(q => q.id === id);
  if (c) {
    c.status = status;
    c.attempt++;
    if (error) c.lastError = String(error).slice(0, 200);
    if (status === 'certified') CERTIFIED.push(id);
    if (status === 'rejected') REJECTED.push(id);
  }
}

export function getStats() {
  return {
    total: QUEUE.length,
    certified: CERTIFIED.length,
    rejected: REJECTED.length,
    pending: QUEUE.filter(c => c.status === 'pending').length,
    inProgress: QUEUE.filter(c => !['pending', 'certified', 'rejected'].includes(c.status)).length,
  };
}
