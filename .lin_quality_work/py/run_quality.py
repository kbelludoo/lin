import importlib.util
spec = importlib.util.spec_from_file_location("m", "bench.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ie = getattr(mod, "is_even", None) or getattr(mod, "isEven")
st = getattr(mod, "sum_to", None) or getattr(mod, "sumTo")
d = getattr(mod, "double_", None) or getattr(mod, "double")
print(mod.factorial(10), ie(7), st(100), mod.square(8), d(5))
