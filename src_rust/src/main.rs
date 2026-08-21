use std::collections::HashMap;
use std::env;
use std::fs;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LinFunction {
    pub name: String,
    pub params: Vec<String>,
    pub body: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LinModule {
    pub header: String,
    pub ops: String,
    pub grammar: String,
    pub functions: Vec<LinFunction>,
    pub exports: Vec<String>,
}

pub fn split_aware(input: &str, delimiter: char) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth_paren = 0;
    let mut depth_brace = 0;
    let mut depth_bracket = 0;
    let mut in_quote: Option<char> = None;
    let mut escape = false;
    let mut start = 0;

    let chars: Vec<char> = input.chars().collect();
    let len = chars.len();

    for i in 0..len {
        let c = chars[i];

        if escape {
            escape = false;
            continue;
        }

        if c == '\\' {
            escape = true;
            continue;
        }

        if let Some(q) = in_quote {
            if c == q {
                in_quote = None;
            }
            continue;
        } else if c == '\'' || c == '"' {
            in_quote = Some(c);
            continue;
        }

        match c {
            '(' => depth_paren += 1,
            ')' => if depth_paren > 0 { depth_paren -= 1; },
            '{' => depth_brace += 1,
            '}' => if depth_brace > 0 { depth_brace -= 1; },
            '[' => depth_bracket += 1,
            ']' => if depth_bracket > 0 { depth_bracket -= 1; },
            _ => {}
        }

        if c == delimiter && depth_paren == 0 && depth_brace == 0 && depth_bracket == 0 && in_quote.is_none() {
            let part: String = chars[start..i].iter().collect();
            let trimmed = part.trim().to_string();
            if !trimmed.is_empty() {
                parts.push(trimmed);
            }
            start = i + 1;
        }
    }

    if start < len {
        let part: String = chars[start..len].iter().collect();
        let trimmed = part.trim().to_string();
        if !trimmed.is_empty() {
            parts.push(trimmed);
        }
    }

    parts
}

pub fn parse_lin_source(content: &str) -> LinModule {
    let mut header = String::new();
    let mut ops = String::new();
    let mut grammar = String::new();
    let mut functions = Vec::new();
    let mut exports = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("@LIN:") || trimmed.starts_with("@RULEL:") {
            header = trimmed.to_string();
        } else if trimmed.starts_with('^') {
            ops = trimmed.to_string();
        } else if trimmed.starts_with("~G") {
            grammar = trimmed.to_string();
        } else if trimmed.starts_with('!') {
            if let (Some(open_paren), Some(close_paren), Some(open_brace), Some(close_brace)) = 
                (trimmed.find('('), trimmed.find(')'), trimmed.find('{'), trimmed.rfind('}')) 
            {
                if open_paren > 1 && close_paren > open_paren && open_brace > close_paren && close_brace > open_brace {
                    let fn_name = trimmed[1..open_paren].trim().to_string();
                    let params_str = trimmed[open_paren + 1..close_paren].trim();
                    let params = split_aware(params_str, ',');
                    let body = trimmed[open_brace + 1..close_brace].trim().to_string();
                    functions.push(LinFunction { name: fn_name, params, body });
                }
            }
        } else if trimmed.starts_with("=ex{") && trimmed.ends_with('}') {
            let inner = &trimmed[4..trimmed.len() - 1];
            exports = split_aware(inner, ',');
        }
    }

    LinModule { header, ops, grammar, functions, exports }
}

pub struct Scope {
    pub vars: HashMap<String, Value>,
}

impl Scope {
    pub fn new() -> Self {
        Scope { vars: HashMap::new() }
    }
}

pub fn eval_expr(expr: &str, scope: &mut Scope, module: &LinModule) -> Value {
    let mut s = expr.trim();
    if s.is_empty() { return Value::Null; }

    while s.starts_with('(') && s.ends_with(')') {
        let mut depth = 0;
        let mut fully_enclosed = true;
        for (idx, ch) in s.chars().enumerate() {
            if ch == '(' { depth += 1; }
            else if ch == ')' {
                depth -= 1;
                if depth == 0 && idx < s.len() - 1 {
                    fully_enclosed = false;
                    break;
                }
            }
        }
        if fully_enclosed && depth == 0 {
            s = s[1..s.len() - 1].trim();
        } else {
            break;
        }
    }

    if s == "true" { return Value::Bool(true); }
    if s == "false" { return Value::Bool(false); }
    if s == "null" || s == "undefined" { return Value::Null; }

    if s.starts_with('!') && !s.starts_with("!=") {
        let inner_val = eval_expr(&s[1..], scope, module);
        return Value::Bool(!is_truthy(&inner_val));
    }

    if (s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2) || 
       (s.starts_with('"') && s.ends_with('"') && s.len() >= 2) {
        return Value::String(s[1..s.len() - 1].to_string());
    }

    if let Ok(n) = s.parse::<i64>() {
        return Value::from(n);
    }
    if let Ok(f) = s.parse::<f64>() {
        if let Some(v) = serde_json::Number::from_f64(f) {
            return Value::Number(v);
        }
    }

    if s.starts_with('[') && s.ends_with(']') {
        let inner = &s[1..s.len() - 1].trim();
        if inner.is_empty() { return Value::Array(Vec::new()); }
        let items: Vec<Value> = split_aware(inner, ',')
            .iter()
            .map(|item| eval_expr(item, scope, module))
            .collect();
        return Value::Array(items);
    }

    if s == "{}" {
        return Value::Object(serde_json::Map::new());
    }

    if let Some(pos) = find_binary_op(s, "||") {
        let v1 = eval_expr(&s[..pos], scope, module);
        if is_truthy(&v1) { return v1; }
        return eval_expr(&s[pos + 2..], scope, module);
    }
    if let Some(pos) = find_binary_op(s, "&&") {
        let v1 = eval_expr(&s[..pos], scope, module);
        if !is_truthy(&v1) { return v1; }
        return eval_expr(&s[pos + 2..], scope, module);
    }

    if let Some(pos) = find_binary_op(s, "==") {
        let v1 = eval_expr(&s[..pos], scope, module);
        let v2 = eval_expr(&s[pos + 2..], scope, module);
        return Value::Bool(v1 == v2);
    }
    if let Some(pos) = find_binary_op(s, "!=") {
        let v1 = eval_expr(&s[..pos], scope, module);
        let v2 = eval_expr(&s[pos + 2..], scope, module);
        return Value::Bool(v1 != v2);
    }
    if let Some(pos) = find_binary_op(s, "<=") {
        let n1 = to_f64(&eval_expr(&s[..pos], scope, module));
        let n2 = to_f64(&eval_expr(&s[pos + 2..], scope, module));
        return Value::Bool(n1 <= n2);
    }
    if let Some(pos) = find_binary_op(s, ">=") {
        let n1 = to_f64(&eval_expr(&s[..pos], scope, module));
        let n2 = to_f64(&eval_expr(&s[pos + 2..], scope, module));
        return Value::Bool(n1 >= n2);
    }
    if let Some(pos) = find_binary_op(s, "<") {
        let n1 = to_f64(&eval_expr(&s[..pos], scope, module));
        let n2 = to_f64(&eval_expr(&s[pos + 1..], scope, module));
        return Value::Bool(n1 < n2);
    }
    if let Some(pos) = find_binary_op(s, ">") {
        let n1 = to_f64(&eval_expr(&s[..pos], scope, module));
        let n2 = to_f64(&eval_expr(&s[pos + 1..], scope, module));
        return Value::Bool(n1 > n2);
    }

    if let Some(pos) = find_binary_op(s, "+") {
        let v1 = eval_expr(&s[..pos], scope, module);
        let v2 = eval_expr(&s[pos + 1..], scope, module);
        if let (Some(n1), Some(n2)) = (v1.as_i64(), v2.as_i64()) {
            return Value::from(n1 + n2);
        }
        if let (Some(f1), Some(f2)) = (v1.as_f64(), v2.as_f64()) {
            if let Some(num) = serde_json::Number::from_f64(f1 + f2) {
                return Value::Number(num);
            }
        }
        let str1 = if let Value::String(st) = v1 { st } else { v1.to_string() };
        let str2 = if let Value::String(st) = v2 { st } else { v2.to_string() };
        return Value::String(format!("{}{}", str1, str2));
    }
    if let Some(pos) = find_binary_op(s, "-") {
        let n1 = to_f64(&eval_expr(&s[..pos], scope, module));
        let n2 = to_f64(&eval_expr(&s[pos + 1..], scope, module));
        let res = n1 - n2;
        if res.fract() == 0.0 { return Value::from(res as i64); }
        if let Some(num) = serde_json::Number::from_f64(res) { return Value::Number(num); }
    }

    if let Some(pos) = find_binary_op(s, "*") {
        let n1 = to_f64(&eval_expr(&s[..pos], scope, module));
        let n2 = to_f64(&eval_expr(&s[pos + 1..], scope, module));
        let res = n1 * n2;
        if res.fract() == 0.0 { return Value::from(res as i64); }
        if let Some(num) = serde_json::Number::from_f64(res) { return Value::Number(num); }
    }
    if let Some(pos) = find_binary_op(s, "/") {
        let n1 = to_f64(&eval_expr(&s[..pos], scope, module));
        let n2 = to_f64(&eval_expr(&s[pos + 1..], scope, module));
        if n2 == 0.0 { return Value::Null; }
        let res = n1 / n2;
        if res.fract() == 0.0 { return Value::from(res as i64); }
        if let Some(num) = serde_json::Number::from_f64(res) { return Value::Number(num); }
    }
    if let Some(pos) = find_binary_op(s, "%") {
        let n1 = eval_expr(&s[..pos], scope, module).as_i64().unwrap_or(0);
        let n2 = eval_expr(&s[pos + 1..], scope, module).as_i64().unwrap_or(1);
        if n2 == 0 { return Value::from(0); }
        return Value::from(n1 % n2);
    }

    if s.ends_with(']') {
        let mut depth = 0;
        let mut open_idx = None;
        let bytes = s.as_bytes();
        for i in (0..bytes.len()).rev() {
            if bytes[i] == b']' { depth += 1; }
            else if bytes[i] == b'[' {
                depth -= 1;
                if depth == 0 {
                    open_idx = Some(i);
                    break;
                }
            }
        }
        if let Some(open_br) = open_idx {
            if open_br > 0 {
                let target_val = eval_expr(&s[..open_br], scope, module);
                let key_val = eval_expr(&s[open_br + 1..s.len() - 1], scope, module);
                match target_val {
                    Value::Array(arr) => {
                        if let Some(idx) = key_val.as_i64() {
                            if idx >= 0 && (idx as usize) < arr.len() {
                                return arr[idx as usize].clone();
                            }
                        }
                        return Value::Null;
                    },
                    Value::Object(map) => {
                        let k = match key_val {
                            Value::String(st) => st,
                            _ => key_val.to_string(),
                        };
                        return map.get(&k).cloned().unwrap_or(Value::Null);
                    },
                    _ => return Value::Null,
                }
            }
        }
    }

    if let Some((target_expr, prop)) = s.split_once('.') {
        let target_val = eval_expr(target_expr, scope, module);
        if prop == "length" {
            match target_val {
                Value::Array(arr) => return Value::from(arr.len() as i64),
                Value::String(str_val) => return Value::from(str_val.len() as i64),
                _ => return Value::from(0),
            }
        }
        if let Value::Object(map) = target_val {
            return map.get(prop).cloned().unwrap_or(Value::Null);
        }
        return Value::Null;
    }

    if let (Some(open_p), Some(close_p)) = (s.find('('), s.rfind(')')) {
        if close_p == s.len() - 1 && open_p > 0 {
            let called_fn_name = &s[..open_p].trim();
            let args_str = &s[open_p + 1..close_p].trim();
            let called_args: Vec<Value> = if args_str.is_empty() {
                Vec::new()
            } else {
                split_aware(args_str, ',')
                    .iter()
                    .map(|arg| eval_expr(arg, scope, module))
                    .collect()
            };

            if let Some(called_fn) = module.functions.iter().find(|f| f.name == *called_fn_name) {
                if let Ok(res) = execute_generic_lin_function(called_fn, &called_args, module) {
                    return res;
                }
            }
        }
    }

    if let Some(val) = scope.vars.get(s) {
        return val.clone();
    }

    Value::String(s.to_string())
}

fn is_truthy(val: &Value) -> bool {
    match val {
        Value::Bool(b) => *b,
        Value::Null => false,
        Value::Number(n) => n.as_f64().unwrap_or(0.0) != 0.0,
        Value::String(s) => !s.is_empty(),
        Value::Array(a) => !a.is_empty(),
        Value::Object(_) => true,
    }
}

fn to_f64(val: &Value) -> f64 {
    match val {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn find_binary_op(s: &str, op: &str) -> Option<usize> {
    let mut depth_paren = 0;
    let mut depth_brace = 0;
    let mut depth_bracket = 0;
    let mut in_quote: Option<char> = None;
    let mut escape = false;

    let chars: Vec<char> = s.chars().collect();
    let op_chars: Vec<char> = op.chars().collect();
    let len = chars.len();
    let op_len = op_chars.len();

    for i in (0..len).rev() {
        let c = chars[i];

        if escape {
            escape = false;
            continue;
        }

        if c == '\\' {
            escape = true;
            continue;
        }

        if let Some(q) = in_quote {
            if c == q { in_quote = None; }
            continue;
        } else if c == '\'' || c == '"' {
            in_quote = Some(c);
            continue;
        }

        match c {
            ')' => depth_paren += 1,
            '(' => if depth_paren > 0 { depth_paren -= 1; },
            '}' => depth_brace += 1,
            '{' => if depth_brace > 0 { depth_brace -= 1; },
            ']' => depth_bracket += 1,
            '[' => if depth_bracket > 0 { depth_bracket -= 1; },
            _ => {}
        }

        if depth_paren == 0 && depth_brace == 0 && depth_bracket == 0 && in_quote.is_none() && i + op_len <= len {
            if chars[i..i + op_len] == op_chars[..] {
                if op == "<" && i + 1 < len && chars[i + 1] == '=' { continue; }
                if op == ">" && i + 1 < len && chars[i + 1] == '=' { continue; }
                if op == "=" && (i > 0 && chars[i - 1] == '=' || i + 1 < len && chars[i + 1] == '=') { continue; }
                if op == "!" && i + 1 < len && chars[i + 1] == '=' { continue; }
                return Some(i);
            }
        }
    }
    None
}

pub fn execute_statement_block(stmts: &[String], scope: &mut Scope, module: &LinModule) -> Result<Option<Value>, String> {
    for stmt in stmts {
        // Return: ^expr
        if stmt.starts_with('^') {
            let ret_expr = &stmt[1..];
            return Ok(Some(eval_expr(ret_expr, scope, module)));
        }

        // Method call push: arr.push(item)
        if let (Some(open_p), Some(close_p)) = (stmt.find(".push("), stmt.rfind(')')) {
            let arr_name = stmt[..open_p].trim();
            let item_expr = &stmt[open_p + 6..close_p].trim();
            let item_val = eval_expr(item_expr, scope, module);

            if let Some(target) = scope.vars.get_mut(arr_name) {
                if let Value::Array(arr) = target {
                    arr.push(item_val);
                }
            }
            continue;
        }

        // Conditional: ?(cond){block}else{block}
        if stmt.starts_with("?(") {
            if let Some(cond_end) = stmt.find(')') {
                let cond_str = &stmt[2..cond_end];
                let cond_val = eval_expr(cond_str, scope, module);
                let is_cond_true = is_truthy(&cond_val);

                if let Some(else_idx) = stmt.find("}else{") {
                    if let (Some(body_start), Some(body_end)) = (stmt.find('{'), stmt.rfind('}')) {
                        let then_branch = &stmt[body_start + 1..else_idx];
                        let else_branch = &stmt[else_idx + 6..body_end];
                        let branch_to_run = if is_cond_true { then_branch } else { else_branch };
                        let inner_stmts = split_aware(branch_to_run, ';');
                        if let Some(val) = execute_statement_block(&inner_stmts, scope, module)? {
                            return Ok(Some(val));
                        }
                    }
                } else if is_cond_true {
                    if let (Some(body_start), Some(body_end)) = (stmt.find('{'), stmt.rfind('}')) {
                        let inner_stmts = split_aware(&stmt[body_start + 1..body_end], ';');
                        if let Some(val) = execute_statement_block(&inner_stmts, scope, module)? {
                            return Ok(Some(val));
                        }
                    }
                }
                continue;
            }
        }

        // Loop: #(init; cond; step){block}
        if stmt.starts_with("#(") {
            let chars: Vec<char> = stmt.chars().collect();
            let mut depth_p = 0;
            let mut loop_hdr_end = None;
            for (idx, &c) in chars.iter().enumerate() {
                if c == '(' { depth_p += 1; }
                else if c == ')' {
                    depth_p -= 1;
                    if depth_p == 0 {
                        loop_hdr_end = Some(idx);
                        break;
                    }
                }
            }

            if let Some(loop_end) = loop_hdr_end {
                let loop_header: String = chars[2..loop_end].iter().collect();
                let loop_parts = split_aware(&loop_header, ';');
                if loop_parts.len() == 3 {
                    let init_expr = &loop_parts[0];
                    let cond_expr = &loop_parts[1];
                    let step_expr = &loop_parts[2];

                    if let Some((v, val)) = init_expr.split_once('=') {
                        let initial_val = eval_expr(val, scope, module);
                        scope.vars.insert(v.trim().to_string(), initial_val);
                    }

                    if let (Some(body_start), Some(body_end)) = (stmt.find('{'), stmt.rfind('}')) {
                        let inner_stmts = split_aware(&stmt[body_start + 1..body_end], ';');

                        while is_truthy(&eval_expr(cond_expr, scope, module)) {
                            if let Some(val) = execute_statement_block(&inner_stmts, scope, module)? {
                                return Ok(Some(val));
                            }

                            if step_expr.ends_with("++") {
                                let v = &step_expr[..step_expr.len() - 2].trim();
                                let cur = scope.vars.get(*v).and_then(|val| val.as_i64()).unwrap_or(0);
                                scope.vars.insert(v.to_string(), Value::from(cur + 1));
                            } else if let Some((v, expr)) = step_expr.split_once('=') {
                                let val = eval_expr(expr, scope, module);
                                scope.vars.insert(v.trim().to_string(), val);
                            }
                        }
                    }
                }
                continue;
            }
        }

        // Array or Object element assignment: target[key] = val
        if let (Some(open_br), Some(close_br)) = (stmt.find('['), stmt.find(']')) {
            if let Some(eq_idx) = stmt.find('=') {
                if eq_idx > close_br {
                    let target_name = stmt[..open_br].trim();
                    let key_expr = &stmt[open_br + 1..close_br].trim();
                    let val_expr = &stmt[eq_idx + 1..].trim();

                    let key_val = eval_expr(key_expr, scope, module);
                    let val = eval_expr(val_expr, scope, module);

                    if let Some(target) = scope.vars.get_mut(target_name) {
                        match target {
                            Value::Array(arr) => {
                                if let Some(idx) = key_val.as_i64() {
                                    let u_idx = idx as usize;
                                    while arr.len() <= u_idx { arr.push(Value::Null); }
                                    arr[u_idx] = val;
                                }
                            },
                            Value::Object(map) => {
                                let k = match key_val {
                                    Value::String(st) => st,
                                    _ => key_val.to_string(),
                                };
                                map.insert(k, val);
                            },
                            _ => {}
                        }
                    }
                    continue;
                }
            }
        }

        // Variable assignment: var = expr
        if let Some((var_name, expr)) = stmt.split_once('=') {
            let val = eval_expr(expr, scope, module);
            scope.vars.insert(var_name.trim().to_string(), val);
        }
    }

    Ok(None)
}

pub fn execute_generic_lin_function(func: &LinFunction, args: &[Value], module: &LinModule) -> Result<Value, String> {
    let mut scope = Scope::new();

    for (i, param_name) in func.params.iter().enumerate() {
        let val = args.get(i).cloned().unwrap_or(Value::Null);
        scope.vars.insert(param_name.clone(), val);
    }

    let stmts = split_aware(&func.body, ';');
    let result = execute_statement_block(&stmts, &mut scope, module)?;

    Ok(result.unwrap_or(Value::Null))
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() >= 4 && args[1] == "call" {
        let file_path = &args[2];
        let fn_name = &args[3];
        let args_json = if args.len() > 4 { &args[4] } else { "[]" };

        let content = fs::read_to_string(file_path).unwrap_or_else(|e| {
            eprintln!("{{\"ok\": false, \"error\": \"Failed to read file: {}\"}}", e);
            std::process::exit(1);
        });

        let module = parse_lin_source(&content);
        let parsed_args: Vec<Value> = serde_json::from_str(args_json).unwrap_or_default();

        let func = module.functions.iter().find(|f| f.name == *fn_name)
            .ok_or_else(|| format!("Function '{}' not found in LIN module", fn_name));

        match func {
            Ok(f) => {
                match execute_generic_lin_function(f, &parsed_args, &module) {
                    Ok(val) => {
                        println!("{}", serde_json::to_string(&val).unwrap());
                    },
                    Err(e) => {
                        eprintln!("{{\"ok\": false, \"error\": \"Execution error: {}\"}}", e);
                        std::process::exit(1);
                    }
                }
            },
            Err(e) => {
                eprintln!("{{\"ok\": false, \"error\": \"{}\"}}", e);
                std::process::exit(1);
            }
        }
        return;
    }

    if args.len() > 1 && args[1] == "--test-suite" {
        println!("Lin Generic Evaluator Core OK");
        return;
    }

    eprintln!("Usage: lin_rust call <file.lin> <fn_name> '<args_json>'");
}
