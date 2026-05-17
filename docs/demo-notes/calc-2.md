# Calculus II — Lecture Notes

## Integration by Parts

Integration by parts is the integral analogue of the product rule for differentiation.
For functions u and v with continuous derivatives, the formula states that the integral
of u dv equals uv minus the integral of v du.

The choice of u and dv is critical. A common heuristic is the LIATE rule: select u in
the order Logarithmic, Inverse trigonometric, Algebraic, Trigonometric, Exponential.
The remaining factor becomes dv.

Example: to evaluate the integral of x times the natural logarithm of x, set u equal to
ln x and dv equal to x dx. Then du is dx over x and v is x squared over two. Applying
the formula yields x squared ln x over two, minus the integral of x over two, which
evaluates to x squared ln x over two minus x squared over four, plus a constant.

## Trigonometric Integrals

Integrals involving products of powers of sine and cosine are handled by case analysis
on the parities of the exponents. When at least one exponent is odd, separate one
factor and convert the remaining even powers using the Pythagorean identity. When both
exponents are even, apply the half-angle identities to reduce the powers.

For products of secant and tangent, similar parity considerations apply, exploiting the
identity that secant squared equals one plus tangent squared.

## Partial Fractions

A proper rational function whose denominator factors into distinct linear factors can be
decomposed into a sum of simpler fractions, each with a constant numerator and one
linear denominator. The numerators are determined by the cover-up method or by
equating coefficients.

When the denominator contains a repeated linear factor of multiplicity k, the
decomposition includes a term for each power from one to k. When the denominator
contains an irreducible quadratic factor, the corresponding term has a linear numerator.

## Improper Integrals

An improper integral arises when either the integrand has an infinite discontinuity on
the interval of integration, or the interval of integration is itself unbounded. Such
an integral is defined as a limit of proper integrals. The integral converges if the
limit exists and is finite, and diverges otherwise.

The comparison test is a useful tool: if the absolute value of f is bounded above by g
on the interval, and the integral of g converges, then the integral of f also
converges absolutely.

## Sequences

A sequence is a function whose domain is the set of positive integers. A sequence
converges to a limit L if, for every positive epsilon, there exists a positive integer
N such that the absolute difference between the n-th term and L is less than epsilon
for all n at least N. A sequence that does not converge is said to diverge.

The squeeze theorem applies to sequences as well as to functions: if a sequence is
bounded between two convergent sequences with a common limit, the middle sequence also
converges to that limit.

## Series

A series is the formal sum of the terms of a sequence. The series converges if its
sequence of partial sums has a finite limit; that limit is then the sum of the series.

The geometric series with first term a and common ratio r converges to a over one minus
r whenever the absolute value of r is less than one, and diverges otherwise. The
harmonic series, whose n-th term is one over n, diverges despite its terms tending to
zero — a classical illustration of the divergence test's necessary but not sufficient
character.

The integral test, comparison test, ratio test, root test, and alternating series test
are the standard convergence tests covered in this unit. The ratio test is often the
first one to try when the terms involve factorials or exponentials.

## Power Series

A power series centered at a is a series of the form sum from n equals zero to infinity
of c sub n times the quantity x minus a, raised to the n. Each power series has a
radius of convergence R: the series converges absolutely for x within R of a, and
diverges for x outside that interval. Behavior at the endpoints must be tested
separately.

The radius of convergence is most directly computed by the ratio test applied to the
absolute values of consecutive terms.

## Taylor Series

The Taylor series of a function f about the point a is the power series whose
coefficients are the successive derivatives of f at a, divided by the corresponding
factorials. When f equals its Taylor series on an interval, f is said to be analytic
on that interval. Maclaurin series is the special case in which a is zero.

The standard Maclaurin series of the exponential, sine, and cosine functions converge
on the entire real line. The series for the natural logarithm of one plus x converges
only on the interval from negative one to one, exclusive of the left endpoint and
inclusive of the right.

## Polar Coordinates

The polar coordinate system describes a point in the plane by its radial distance r
from the origin and an angle theta measured from the positive x-axis. Conversion to
Cartesian coordinates uses x equals r cosine theta and y equals r sine theta.

Areas in polar coordinates are computed by integrating one-half r squared d theta over
the angular interval that traces the region. Arc length and surface area formulas in
polar coordinates follow analogously, with appropriate substitutions for r and its
derivative with respect to theta.
