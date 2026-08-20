//! LIN Core Library - Rust Implementation
//! 
//! This module implements the core components of the LIN language:
//! - Parser (LIA/LIN syntax)
//! - AST (Abstract Syntax Tree)
//! - IR (Intermediate Representation)
//! - Type Checker
//! - Semantic Hash
//! - Emitter (code generation for multiple targets)

use serde::{Deserialize, Serialize};
use std::fmt::Write;

/// LIN Header format
pub const LIN_HEADER: &str = "@LIN:L1c:0.2";
pub const LIA_HEADER: &str = "@LIN:L1c:0.2";

/// ============================================================================
/// AST Definitions
/// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Program {
    pub header: String,
    pub schema_flags: SchemaFlags,
    pub sigil_table: SigilTable,
    pub functions: Vec<Function>,
    pub exports: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaFlags {
    pub schema_once: bool,
    pub lossy: bool,
    pub ops: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SigilTable {
    pub question: String,  // ? = if
    pub hash: String,      // # = for
    pub caret: String,     // ^ = ret
    pub colon: String,     // : = else
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Function {
    pub name: String,
    pub params: Vec<String>,
    pub body: String,
}

/// ============================================================================
/// Parser
/// ============================================================================

pub fn parse_lia(source: &str) -> Result<Program, String> {
    let lines: Vec<&str> = source.lines().collect();
    if lines.is_empty() {
        return Err("Empty source".to_string());
    }

    // Parse header
    let header = lines[0].trim();
    if !header.starts_with("@LIN:") && !header.starts_with("@LIA:") && !header.starts_with("@AIL:") {
        return Err(format!("Invalid header: {}", header));
    }

    // Parse second line with flags and sigils
    if lines.len() < 2 {
        return Err("Missing schema/sigil line".to_string());
    }

    let schema_line = lines[1].trim();
    let (schema_flags, sigil_table) = parse_schema_and_sigils(schema_line)?;

    // Parse functions and exports
    let mut functions = Vec::new();
    let mut exports = Vec::new();

    for line in lines.iter().skip(2) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if line.starts_with("!") {
            // Function definition
            functions.push(parse_function(line)?);
        } else if line.starts_with("=ex{") {
            // Export statement
            exports = parse_exports(line)?;
        }
    }

    Ok(Program {
        header: header.to_string(),
        schema_flags,
        sigil_table,
        functions,
        exports,
    })
}

fn parse_schema_and_sigils(line: &str) -> Result<(SchemaFlags, SigilTable), String> {
    let mut schema_once = false;
    let mut lossy = false;
    let mut ops = None;
    
    // Parse schema flags
    if line.contains("^schema_once") {
        schema_once = true;
    }
    if line.contains("^lossy=true") {
        lossy = true;
    }
    
    // Extract ops value
    if let Some(ops_start) = line.find("^ops=") {
        let ops_end = line[ops_start..].find(' ').unwrap_or(line.len() - ops_start);
        let ops_value = &line[ops_start + 5..ops_start + ops_end];
        ops = Some(ops_value.to_string());
    }

    // Parse sigil table ~G{?=if #=for ^=ret :else}
    let sigil_table = if let Some(start) = line.find("~G{") {
        if let Some(end) = line[start..].find('}') {
            let sigils = &line[start + 3..start + end];
            parse_sigils(sigils)?
        } else {
            return Err("Unclosed sigil table".to_string());
        }
    } else {
        // Default sigils
        SigilTable {
            question: "if".to_string(),
            hash: "for".to_string(),
            caret: "ret".to_string(),
            colon: "else".to_string(),
        }
    };

    Ok((SchemaFlags { schema_once, lossy, ops }, sigil_table))
}

fn parse_sigils(sigils: &str) -> Result<SigilTable, String> {
    let mut question = "if".to_string();
    let mut hash = "for".to_string();
    let mut caret = "ret".to_string();
    let mut colon = "else".to_string();

    for part in sigils.split_whitespace() {
        if part.starts_with("?=") {
            question = part[2..].to_string();
        } else if part.starts_with("#=") {
            hash = part[2..].to_string();
        } else if part.starts_with("^=") {
            caret = part[2..].to_string();
        } else if part.starts_with(":") {
            colon = part[1..].to_string();
        }
    }

    Ok(SigilTable { question, hash, caret, colon })
}

fn parse_function(line: &str) -> Result<Function, String> {
    // Format: !name(params){body}
    if !line.starts_with("!") {
        return Err("Function must start with !".to_string());
    }

    let rest = &line[1..];
    let paren_start = rest.find('(').ok_or("Missing ( in function")?;
    let paren_end = rest.find(')').ok_or("Missing ) in function")?;
    let brace_start = rest.find('{').ok_or("Missing { in function")?;
    
    // Find matching closing brace
    let mut depth = 1;
    let mut brace_end = None;
    for (i, c) in rest.chars().enumerate().skip(brace_start + 1) {
        if c == '{' {
            depth += 1;
        } else if c == '}' {
            depth -= 1;
            if depth == 0 {
                brace_end = Some(i);
                break;
            }
        }
    }
    let brace_end = brace_end.ok_or("Unclosed function body")?;

    let name = rest[..paren_start].trim().to_string();
    let params_str = &rest[paren_start + 1..paren_end];
    let params: Vec<String> = if params_str.trim().is_empty() {
        Vec::new()
    } else {
        params_str.split(',').map(|s| s.trim().to_string()).collect()
    };
    let body = rest[brace_start + 1..brace_end].to_string();

    Ok(Function { name, params, body })
}

fn parse_exports(line: &str) -> Result<Vec<String>, String> {
    // Format: =ex{name1,name2,...}
    if !line.starts_with("=ex{") {
        return Err("Invalid export statement".to_string());
    }
    
    let start = 4; // Skip "=ex{"
    let end = line.find('}').ok_or("Unclosed export")?;
    let content = &line[start..end];
    
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    
    Ok(content.split(',').map(|s| s.trim().to_string()).collect())
}

/// ============================================================================
/// Type Checker (Basic)
/// ============================================================================

pub fn type_check(program: &Program) -> Result<(), String> {
    // Basic validation
    for func in &program.functions {
        if func.name.is_empty() {
            return Err("Function name cannot be empty".to_string());
        }
    }
    Ok(())
}

/// ============================================================================
/// Canonicalize + Content Hash — matches JS content_hash.mjs exactly
/// ============================================================================

const RESERVED_WORDS: &[&str] = &[
    "var", "let", "const", "return", "if", "else", "while", "for", "in", "of",
    "null", "true", "false", "undefined", "void", "typeof",
];

const IDENT_KEYWORDS: &[&str] = &[
    "true", "false", "null", "undefined", "NaN", "Infinity",
    "if", "else", "while", "for", "return", "throw", "switch", "case", "default",
];

fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$'
}

fn word_boundary_before(s: &str, pos: usize) -> bool {
    pos == 0 || {
        let b = s.as_bytes()[pos - 1];
        !b.is_ascii_alphanumeric() && b != b'_' && b != b'$'
    }
}

fn word_boundary_after(s: &str, pos: usize) -> bool {
    pos >= s.len() || {
        let b = s.as_bytes()[pos];
        !b.is_ascii_alphanumeric() && b != b'_' && b != b'$'
    }
}

fn replace_word_all(s: &str, word: &str, replacement: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    let wlen = word.len();
    while i < s.len() {
        if i + wlen <= s.len()
            && &s[i..i + wlen] == word
            && word_boundary_before(s, i)
            && word_boundary_after(s, i + wlen)
        {
            out.push_str(replacement);
            i += wlen;
        } else {
            out.push(s.as_bytes()[i] as char);
            i += 1;
        }
    }
    out
}

fn strip_comments(body: &str) -> String {
    let bytes = body.as_bytes();
    let len = bytes.len();
    let mut out = Vec::with_capacity(len);
    let mut i = 0;
    let mut in_sq = false;
    let mut in_dq = false;
    while i < len {
        let c = bytes[i] as char;
        if in_sq {
            if c == '\\' && i + 1 < len { out.push(bytes[i]); out.push(bytes[i+1]); i += 2; continue; }
            if c == '\'' { in_sq = false; }
            out.push(bytes[i]); i += 1; continue;
        }
        if in_dq {
            if c == '\\' && i + 1 < len { out.push(bytes[i]); out.push(bytes[i+1]); i += 2; continue; }
            if c == '"' { in_dq = false; }
            out.push(bytes[i]); i += 1; continue;
        }
        if c == '\'' { in_sq = true; out.push(bytes[i]); i += 1; continue; }
        if c == '"' { in_dq = true; out.push(bytes[i]); i += 1; continue; }
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'/' {
            while i < len && bytes[i] != b'\n' { i += 1; }
            continue;
        }
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') { i += 1; }
            i += 2;
            continue;
        }
        out.push(bytes[i]); i += 1;
    }
    String::from_utf8(out).unwrap_or_default()
}

fn collect_ids_flat(text: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;
    while i < len {
        if chars[i] == '"' || chars[i] == '\'' {
            let q = chars[i]; i += 1;
            while i < len && chars[i] != q {
                if chars[i] == '\\' && i + 1 < len { i += 2; } else { i += 1; }
            }
            if i < len { i += 1; } continue;
        }
        if i + 1 < len && chars[i] == '/' && chars[i + 1] == '/' {
            while i < len && chars[i] != '\n' { i += 1; } continue;
        }
        if i + 1 < len && chars[i] == '/' && chars[i + 1] == '*' {
            i += 2;
            while i + 1 < len && !(chars[i] == '*' && chars[i + 1] == '/') { i += 1; }
            i += 2; continue;
        }
        if chars[i].is_ascii_alphabetic() || chars[i] == '_' {
            let start = i;
            while i < len && is_ident_char(chars[i]) { i += 1; }
            let word: String = chars[start..i].iter().collect();
            if !IDENT_KEYWORDS.contains(&word.as_str()) {
                if start == 0 || chars[start - 1] != '.' {
                    ids.push(word);
                }
            }
            continue;
        }
        i += 1;
    }
    ids
}

fn is_pure_rhs(expr: &str) -> bool {
    let s = expr.trim();
    if s.is_empty() { return false; }
    let stripped = s.strip_prefix('-').unwrap_or(s);
    if stripped.chars().all(|c| c.is_ascii_digit()) && !stripped.is_empty() { return true; }
    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) { return true; }
    if matches!(s, "true" | "false" | "null" | "undefined" | "NaN" | "Infinity") { return true; }
    if !s.is_empty() && (s.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_'))
        && s.chars().all(|c| is_ident_char(c)) { return true; }
    if s.contains('(') { return false; }
    if s.contains("console.") || s.contains("throw") || s.contains("fetch(")
        || s.contains("process.") || s.contains("require(") { return false; }
    if s.contains("String(") || s.contains("Number(") || s.contains("Math.")
        || s.contains("Array(") || s.contains("Object(") || s.contains("JSON.") { return false; }
    if let Some(pos) = find_rhs_binary_op(s) {
        let left = &s[..pos];
        let right = &s[pos + 1..];
        return is_pure_rhs(left) && is_pure_rhs(right);
    }
    false
}

fn find_rhs_binary_op(s: &str) -> Option<usize> {
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut depth = 0i32;
    let mut in_q: Option<char> = None;
    for i in (0..len).rev() {
        let c = chars[i];
        if let Some(q) = in_q {
            if c == q { in_q = None; } continue;
        }
        if c == '"' || c == '\'' { in_q = Some(c); continue; }
        if c == ')' || c == ']' || c == '}' { depth += 1; continue; }
        if c == '(' || c == '[' || c == '{' { depth -= 1; continue; }
        if depth == 0 && "+-*/%&|^<>".contains(c) {
            if i > 0 && "+-*/%&|^<>".contains(chars[i - 1]) { continue; }
            return Some(i);
        }
    }
    None
}

fn find_dead_assignments(body: &str) -> Vec<String> {
    let all_used: Vec<String> = collect_ids_flat(body);
    let reserved_set: std::collections::HashSet<&str> = RESERVED_WORDS.iter().copied().collect();
    let chars: Vec<char> = body.chars().collect();
    let len = chars.len();
    let mut dead = Vec::new();
    let mut i = 0;
    while i < len {
        if chars[i] == '"' || chars[i] == '\'' {
            let q = chars[i]; i += 1;
            while i < len && chars[i] != q {
                if chars[i] == '\\' && i + 1 < len { i += 2; } else { i += 1; }
            }
            if i < len { i += 1; } continue;
        }
        let can_start = i == 0 || matches!(chars[i - 1], ';' | '{' | '(' | '\n' | '\r');
        if can_start && (chars[i].is_ascii_alphabetic() || chars[i] == '_') {
            let start = i;
            while i < len && is_ident_char(chars[i]) { i += 1; }
            let id: String = chars[start..i].iter().collect();
            while i < len && chars[i] == ' ' { i += 1; }
            if i < len && chars[i] == '=' && (i + 1 >= len || chars[i + 1] != '=') {
                i += 1;
                while i < len && chars[i] == ' ' { i += 1; }
                let expr_start = i;
                while i < len && chars[i] != ';' && chars[i] != '\n' && chars[i] != '\r' { i += 1; }
                let expr: String = chars[expr_start..i].iter().collect();
                if !reserved_set.contains(id.as_str())
                    && !id.starts_with('$')
                    && is_pure_rhs(&expr)
                {
                    let id_count = all_used.iter().filter(|u| *u == &id).count();
                    if id_count <= 1 {
                        dead.push(id);
                    }
                }
                continue;
            }
        }
        i += 1;
    }
    dead
}

fn strip_dead_assigns(body: &str) -> String {
    let dead = find_dead_assignments(body);
    if dead.is_empty() { return body.to_string(); }
    let mut result = body.to_string();
    for id in &dead {
        let pat = format!(r"(^|[;{{])\s*{}\s*=\s*[^;]*;?", regex::escape(id));
        if let Ok(re) = regex::Regex::new(&pat) {
            if let Some(m) = re.find(&result) {
                let matched = m.as_str();
                let sep_len = matched.chars().take_while(|&c| c == ';' || c == '{' || c == ' ').count();
                let keep_end = m.start() + sep_len;
                let skip_end = m.start() + matched.len();
                let keep = &result[..keep_end];
                let skip = &result[skip_end..];
                result = format!("{}{}", keep, skip);
            }
        }
    }
    result.trim().to_string()
}

/// Canonicalize a function body for hashing, matching JS content_hash.mjs canonicalize() exactly.
///
/// Steps: strip_comments → strip_dead_assigns → normalize_ws → alpha_rename_params → alpha_rename_locals
/// → normalize_strings → normalize_operators → strip_trailing_semicolons
/// Returns "(paramCount:paramTypes)canonicalBody"
pub fn canonicalize(_fn_name: &str, params_str: &str, body: &str) -> String {
    let mut canon = body.trim().to_string();
    canon = strip_comments(&canon);
    canon = strip_dead_assigns(&canon);

    let ws_re = regex::Regex::new(r"\s+").unwrap();
    canon = ws_re.replace_all(&canon, " ").to_string();

    let op_re = regex::Regex::new(r"\s*([=+\-*/%&|^<>(),;!?:{}\[\]])\s*").unwrap();
    canon = op_re.replace_all(&canon, "$1").to_string();
    canon = canon.trim().to_string();

    let raw_params: Vec<String> = params_str.split(',')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    let param_types: Vec<String> = raw_params.iter()
        .map(|p| {
            if let Some(pos) = p.find(':') {
                p[pos + 1..].trim().to_string()
            } else {
                String::new()
            }
        })
        .collect();
    let param_names: Vec<String> = raw_params.iter()
        .map(|p| {
            if let Some(pos) = p.find(':') {
                p[..pos].trim().to_string()
            } else {
                p.clone()
            }
        })
        .collect();
    let param_types_str = param_types.join(",");

    for (i, name) in param_names.iter().enumerate() {
        if name.is_empty() { continue; }
        let replacement = format!("${}", i);
        canon = replace_word_all(&canon, name, &replacement);
    }

    let assign_re = regex::Regex::new(r"(?:^|[;{(])\s*([a-zA-Z_$][\w$]*)\s*=").unwrap();
    let mut locals: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for cap in assign_re.captures_iter(&canon) {
        if let Some(m) = cap.get(1) {
            let id = m.as_str().to_string();
            let eq_pos = m.end();
            let next_is_eq = canon.as_bytes().get(eq_pos) == Some(&b'=');
            if next_is_eq { continue; }
            if !seen.contains(&id) && !id.starts_with('$') && !RESERVED_WORDS.contains(&id.as_str()) {
                seen.insert(id.clone());
                locals.push(id);
            }
        }
    }
    for (i, name) in locals.iter().enumerate() {
        let replacement = format!("_l{}", i);
        canon = replace_word_all(&canon, name, &replacement);
    }

    canon = canon.replace('\'', "\"");
    canon = canon.replace("===", "==").replace("!==", "!=");

    while canon.ends_with(';') { canon.pop(); }

    format!("({}:{}){}", param_names.len(), param_types_str, canon)
}

/// Compute the content-addressed hash of a single LIN function.
/// Returns a 16-char hex string (64-bit collision resistance), matching JS contentHash().
pub fn content_hash(fn_name: &str, params: &str, body: &str) -> String {
    use sha2::{Sha256, Digest};
    let canonical = canonicalize(fn_name, params, body);
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    let result = hasher.finalize();
    let hex: String = result.iter().map(|b| format!("{:02x}", b)).collect();
    hex[..16].to_string()
}

/// Compute the semantic hash of a full program.
/// Concatenates per-function content hashes with the module header.
/// Matches JS linobj.mjs computeModuleSemanticHash() + content_hash.mjs semantics.
pub fn compute_semantic_hash(program: &Program) -> String {
    use sha2::{Sha256, Digest};
    let mut input = String::new();
    input.push_str(&program.header);
    input.push('\n');
    for func in &program.functions {
        let params = func.params.join(",");
        let h = content_hash(&func.name, &params, &func.body);
        input.push_str(&h);
        input.push('\n');
    }
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    let hex: String = result.iter().map(|b| format!("{:02x}", b)).collect();
    hex[..16].to_string()
}

/// Check if two functions are semantically equivalent (same content hash).
pub fn semantic_equals(fn1_name: &str, fn1_params: &str, fn1_body: &str,
                       fn2_name: &str, fn2_params: &str, fn2_body: &str) -> bool {
    content_hash(fn1_name, fn1_params, fn1_body) == content_hash(fn2_name, fn2_params, fn2_body)
}

/// ============================================================================
/// Emitter - Code Generation for Multiple Targets
/// ============================================================================

pub enum Target {
    JavaScript,
    TypeScript,
    Python,
    Rust,
    Go,
    C,
}

impl Target {
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_lowercase().as_str() {
            "js" | "javascript" => Ok(Target::JavaScript),
            "ts" | "typescript" => Ok(Target::TypeScript),
            "py" | "python" => Ok(Target::Python),
            "rs" | "rust" => Ok(Target::Rust),
            "go" => Ok(Target::Go),
            "c" => Ok(Target::C),
            _ => Err(format!("Unknown target: {}", s)),
        }
    }
}

pub fn emit_code(program: &Program, target: &Target) -> Result<String, String> {
    match target {
        Target::JavaScript => emit_javascript(program),
        Target::TypeScript => emit_typescript(program),
        Target::Python => emit_python(program),
        Target::Rust => emit_rust_target(program),
        Target::Go => emit_go(program),
        Target::C => emit_c(program),
    }
}

fn emit_javascript(program: &Program) -> Result<String, String> {
    let mut output = String::new();
    
    // Add LIN header comment
    writeln!(output, "// Generated by LIN Compiler (Rust)").unwrap();
    writeln!(output, "// Source: {}", program.header).unwrap();
    writeln!(output).unwrap();
    
    // Generate functions
    for func in &program.functions {
        let params = func.params.join(", ");
        writeln!(output, "function {}({}) {{", func.name, params).unwrap();
        
        // Simple body translation (placeholder - full implementation would parse the body)
        let body = translate_body_to_js(&func.body, &program.sigil_table);
        for line in body.lines() {
            writeln!(output, "  {}", line).unwrap();
        }
        
        writeln!(output, "}}").unwrap();
        writeln!(output).unwrap();
    }
    
    // Generate exports
    if !program.exports.is_empty() {
        writeln!(output, "module.exports = {{").unwrap();
        for (i, exp) in program.exports.iter().enumerate() {
            let comma = if i < program.exports.len() - 1 { "," } else { "" };
            writeln!(output, "  {}{}", exp, comma).unwrap();
        }
        writeln!(output, "}};").unwrap();
    }
    
    Ok(output)
}

fn emit_typescript(program: &Program) -> Result<String, String> {
    let mut output = String::new();
    
    writeln!(output, "// Generated by LIN Compiler (Rust)").unwrap();
    writeln!(output, "// Source: {}", program.header).unwrap();
    writeln!(output).unwrap();
    
    for func in &program.functions {
        let params = func.params.join(", ");
        writeln!(output, "export function {}({}): any {{", func.name, params).unwrap();
        
        let body = translate_body_to_js(&func.body, &program.sigil_table);
        for line in body.lines() {
            writeln!(output, "  {}", line).unwrap();
        }
        
        writeln!(output, "}}").unwrap();
        writeln!(output).unwrap();
    }
    
    Ok(output)
}

fn emit_python(program: &Program) -> Result<String, String> {
    let mut output = String::new();
    
    writeln!(output, "# Generated by LIN Compiler (Rust)").unwrap();
    writeln!(output, "# Source: {}", program.header).unwrap();
    writeln!(output).unwrap();
    
    for func in &program.functions {
        let params = func.params.join(", ");
        writeln!(output, "def {}({}):", func.name, params).unwrap();
        
        let body = translate_body_to_py(&func.body, &program.sigil_table);
        for line in body.lines() {
            writeln!(output, "    {}", line).unwrap();
        }
        writeln!(output).unwrap();
    }
    
    if !program.exports.is_empty() {
        writeln!(output, "__all__ = [{}]", program.exports.iter()
            .map(|s| format!("\"{}\"", s))
            .collect::<Vec<_>>()
            .join(", ")).unwrap();
    }
    
    Ok(output)
}

fn emit_rust_target(program: &Program) -> Result<String, String> {
    let mut output = String::new();
    
    writeln!(output, "// Generated by LIN Compiler (Rust)").unwrap();
    writeln!(output, "// Source: {}", program.header).unwrap();
    writeln!(output).unwrap();
    
    for func in &program.functions {
        let params = func.params.iter()
            .map(|p| format!("{}: i64", p))
            .collect::<Vec<_>>()
            .join(", ");
        
        writeln!(output, "pub fn {}({}) -> i64 {{", func.name, params).unwrap();
        
        let body = translate_body_to_rust(&func.body, &program.sigil_table);
        for line in body.lines() {
            writeln!(output, "    {}", line).unwrap();
        }
        
        writeln!(output, "}}").unwrap();
        writeln!(output).unwrap();
    }
    
    Ok(output)
}

fn emit_go(program: &Program) -> Result<String, String> {
    let mut output = String::new();
    
    writeln!(output, "// Generated by LIN Compiler (Rust)").unwrap();
    writeln!(output, "// Source: {}", program.header).unwrap();
    writeln!(output).unwrap();
    writeln!(output, "package main").unwrap();
    writeln!(output).unwrap();
    
    for func in &program.functions {
        let params = func.params.iter()
            .map(|p| format!("{} int64", p))
            .collect::<Vec<_>>()
            .join(", ");
        
        writeln!(output, "func {}({}) int64 {{", func.name, params).unwrap();
        
        let body = translate_body_to_go(&func.body, &program.sigil_table);
        for line in body.lines() {
            writeln!(output, "    {}", line).unwrap();
        }
        
        writeln!(output, "}}").unwrap();
        writeln!(output).unwrap();
    }
    
    Ok(output)
}

fn emit_c(program: &Program) -> Result<String, String> {
    let mut output = String::new();
    
    writeln!(output, "// Generated by LIN Compiler (Rust)").unwrap();
    writeln!(output, "// Source: {}", program.header).unwrap();
    writeln!(output).unwrap();
    
    for func in &program.functions {
        let params = func.params.iter()
            .map(|p| format!("long {}", p))
            .collect::<Vec<_>>()
            .join(", ");
        
        writeln!(output, "long {}({}) {{", func.name, params).unwrap();
        
        let body = translate_body_to_c(&func.body, &program.sigil_table);
        for line in body.lines() {
            writeln!(output, "    {}", line).unwrap();
        }
        
        writeln!(output, "}}").unwrap();
        writeln!(output).unwrap();
    }
    
    Ok(output)
}

// Simple body translation helpers (placeholder implementations)
fn translate_body_to_js(body: &str, _sigils: &SigilTable) -> String {
    // In a full implementation, this would properly parse and translate
    // For now, do basic sigil replacement
    body.replace("^return ", "return ")
        .replace("?(", "if (")
        .replace("#(", "for (")
        .replace("){", ") {")
        .replace(";^", "; return ")
}

fn translate_body_to_py(body: &str, _sigils: &SigilTable) -> String {
    body.replace("^return ", "return ")
        .replace("?(", "if ")
        .replace("#(", "for ")
        .replace("){", ":")
        .replace(";^", "; return ")
}

fn translate_body_to_rust(body: &str, _sigils: &SigilTable) -> String {
    body.replace("^return ", "return ")
        .replace("?(", "if ")
        .replace("#(", "for ")
        .replace("){", ") {")
        .replace(";^", "; return ")
}

fn translate_body_to_go(body: &str, _sigils: &SigilTable) -> String {
    body.replace("^return ", "return ")
        .replace("?(", "if ")
        .replace("#(", "for ")
        .replace("){", ") {")
        .replace(";^", "; return ")
}

fn translate_body_to_c(body: &str, _sigils: &SigilTable) -> String {
    body.replace("^return ", "return ")
        .replace("?(", "if ")
        .replace("#(", "for ")
        .replace("){", ") {")
        .replace(";^", "; return ")
}

/// ============================================================================
/// Tests
/// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_program() {
        let source = "@LIN:L1c:0.2
^schema_once ^lossy=true ^ops=test
~G{?=if #=for ^=ret :else}
!safeCompare(a,b){A=String(a);B=String(b);^A==B}
=ex{safeCompare}";

        let program = parse_lia(source).unwrap();
        assert_eq!(program.header, "@LIN:L1c:0.2");
        assert!(program.schema_flags.schema_once);
        assert!(program.schema_flags.lossy);
        assert_eq!(program.functions.len(), 1);
        assert_eq!(program.functions[0].name, "safeCompare");
        assert_eq!(program.exports, vec!["safeCompare"]);
    }

    #[test]
    fn test_type_check() {
        let source = "@LIN:L1c:0.2
^schema_once
!foo(x){^x+1}
=ex{foo}";

        let program = parse_lia(source).unwrap();
        assert!(type_check(&program).is_ok());
    }

    #[test]
    fn test_emit_javascript() {
        let source = "@LIN:L1c:0.2
^schema_once
!add(a,b){^a+b}
=ex{add}";

        let program = parse_lia(source).unwrap();
        let js = emit_code(&program, &Target::JavaScript).unwrap();
        assert!(js.contains("function add(a, b)"));
        assert!(js.contains("module.exports"));
    }

    #[test]
    fn test_emit_python() {
        let source = "@LIN:L1c:0.2
^schema_once
!add(a,b){^a+b}
=ex{add}";

        let program = parse_lia(source).unwrap();
        let py = emit_code(&program, &Target::Python).unwrap();
        assert!(py.contains("def add(a, b):"));
        assert!(py.contains("__all__"));
    }

    #[test]
    fn test_emit_rust() {
        let source = "@LIN:L1c:0.2
^schema_once
!add(a,b){^a+b}
=ex{add}";

        let program = parse_lia(source).unwrap();
        let rs = emit_code(&program, &Target::Rust).unwrap();
        assert!(rs.contains("pub fn add(a: i64, b: i64) -> i64"));
    }

    #[test]
    fn test_semantic_hash() {
        let source = "@LIN:L1c:0.2
^schema_once
!foo(x){^x+1}
=ex{foo}";

        let program = parse_lia(source).unwrap();
        let hash1 = compute_semantic_hash(&program);
        let hash2 = compute_semantic_hash(&program);
        assert_eq!(hash1, hash2); // Same program = same hash
    }
}
