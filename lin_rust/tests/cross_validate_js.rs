use lin_core::{canonicalize, content_hash};

#[test]
fn test_canonicalize_matches_js_values() {
    let cases: Vec<(&str, &str, &str, &str)> = vec![
        ("add", "a,b", "a+b", "(2:,)$0+$1"),
        ("add", "x:int,y:int", "x+y", "(2:int,int)$0+$1"),
        ("isEven", "n:int", "n%2==0", "(1:int)$0%2==0"),
    ];
    for (name, params, body, expected) in cases {
        let result = canonicalize(name, params, body);
        assert_eq!(
            result, *expected,
            "canonicalize(\"{}\", \"{}\", \"{}\") = \"{}\", expected \"{}\"",
            name, params, body, result, expected
        );
    }
}

#[test]
fn test_content_hash_matches_js_values() {
    let cases: Vec<(&str, &str, &str, &str)> = vec![
        ("add", "a,b", "a+b", "d073100267a161f6"),
        ("add", "x:int,y:int", "x+y", "4e69c83221081425"),
        ("isEven", "n:int", "n%2==0", "3f15fd4a3be58e4d"),
    ];
    for (name, params, body, expected) in cases {
        let result = content_hash(name, params, body);
        assert_eq!(
            result, *expected,
            "content_hash(\"{}\", \"{}\", \"{}\") = \"{}\", expected \"{}\"",
            name, params, body, result, expected
        );
    }
}

#[test]
fn test_semantic_equals() {
    assert!(lin_core::semantic_equals("add", "a,b", "a+b", "add", "x,y", "x+y"));
    assert!(!lin_core::semantic_equals("add", "a,b", "a+b", "sub", "a,b", "a-b"));
}

#[test]
fn test_dead_assignment_elimination() {
    let result = canonicalize("f", "x", "y=x+1;unused=42;^y");
    assert!(!result.contains("unused"), "dead assignment should be stripped: {}", result);
    assert!(result.contains("$0+1") || result.contains("$0 + 1") || result.contains("$0+1"));
}
