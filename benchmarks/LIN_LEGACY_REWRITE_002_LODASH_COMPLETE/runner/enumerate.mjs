import _ from "lodash";
const allFns = Object.keys(_).filter(k => typeof _[k] === "function");
console.log("TOTAL_PUBLIC_FUNCTIONS:", allFns.length);
const catCounts = { Array: 65, Collection: 29, Object: 47, Lang: 60, Math: 15, Function: 23, String: 30, Util: 31 };
console.log("CATEGORY_BREAKDOWN:", JSON.stringify(catCounts));
console.log("GRAND_TOTAL_EXPECTED:", Object.values(catCounts).reduce((a,b)=>a+b,0));
