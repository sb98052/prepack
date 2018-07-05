(function () {
  function f(g, c) {
    let o = {foo: 42};
    if (c) {
      g(o => o);
    } else {
      o.now = 1;
    } 

    return o;
  }

  global.__optimize && __optimize(f);
  inspect = function() { return JSON.stringify(f(h => h(), false));}
})();
