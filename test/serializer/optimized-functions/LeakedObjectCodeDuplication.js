// Copies of 42:1
function f(g) {
    var o = {};
    o.foo = 42;
    return g(function() { return o.foo; });
}

global.__optimize && __optimize(f);
inspect = function() { return f(h => h()); }
