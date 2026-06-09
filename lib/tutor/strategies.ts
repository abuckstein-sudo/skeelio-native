// Deterministic teaching strategies (no AI). Each picker returns text AND numbers
// that drive its visual, so text and picture can't diverge.

export type VisualType = "groups" | "array" | "number_line" | "doubling_chain" | "parts" | "remove" | "chain" | "none";

export interface StrategyPlan {
  strategy: string;
  label: string;
  visual_type: VisualType;
  step_1: string;
  step_2: string;
  value: number;
  visual_a?: number;
  visual_b?: number; // groups: a groups of b dots | array: a×b | number_line: b hops of size a
  extraGroups?: number; // for ×11/×12, build_from_five: groups to highlight
  removeGroups?: number; // for ×9 (near_ten): groups to strike-through
  chainSteps?: number[]; // for doubling (×2,×4,×8): sequence of values to show
  partA?: number; // for addition: first part
  partB?: number; // for addition: second part
  total?: number; // for subtraction: total before removal
  removeCount?: number; // for subtraction: how many to remove
}

export function pickMultiplicationStrategy(
  aIn: number,
  bIn: number
): StrategyPlan {
  // Normalize so easier factor comes first
  const [a, b] =
    bIn === 5 || bIn === 10 || bIn === 2 || bIn === 4 || bIn === 1
      ? [bIn, aIn]
      : [aIn, bIn];

  const product = a * b;
  const other = (x: number) => (a === x ? b : a);

  // Times eleven: 10 plus one more
  if (a === 11 || b === 11) {
    const o = other(11);
    const tenPart = o * 10;
    return {
      strategy: "ten_plus_one",
      label: "ten, plus one more",
      visual_type: "groups",
      step_1: `${o} × 10 = ${tenPart}`,
      step_2: `then one more group of ${o}: ${tenPart} + ${o} = ${product}`,
      value: product,
      visual_a: 11,
      visual_b: o,
      extraGroups: 1,
    };
  }

  // Times twelve: 10 plus two more
  if (a === 12 || b === 12) {
    const o = other(12);
    const tenPart = o * 10;
    const twoMore = 2 * o;
    return {
      strategy: "ten_plus_two",
      label: "ten, plus two more",
      visual_type: "groups",
      step_1: `${o} × 10 = ${tenPart}`,
      step_2: `then two more groups of ${o}: ${tenPart} + ${twoMore} = ${product}`,
      value: product,
      visual_a: 12,
      visual_b: o,
      extraGroups: 2,
    };
  }

  // Times one: identity
  if (a === 1 || b === 1) {
    const o = other(1);
    return {
      strategy: "times_one",
      label: "times one",
      visual_type: "none",
      step_1: `anything times 1 is itself, so ${o} × 1 = ${o}`,
      step_2: `the answer is ${product}`,
      value: product,
      visual_a: 1,
      visual_b: o,
    };
  }

  // Times ten: append zero
  if (a === 10 || b === 10) {
    const o = other(10);
    return {
      strategy: "times_ten",
      label: "times ten",
      visual_type: "number_line",
      step_1: `to multiply by 10, put a 0 on the end of ${o}`,
      step_2: `so ${o} × 10 = ${product}`,
      value: product,
      visual_a: o, // step size
      visual_b: 10, // number of hops
    };
  }

  // Times five: skip-count
  if (a === 5 || b === 5) {
    const o = other(5);
    return {
      strategy: "skip_count_by_five",
      label: "skip-count by 5",
      visual_type: "number_line",
      step_1: `count by 5s, ${o} times: 5, 10, 15…`,
      step_2: `you land on ${product}`,
      value: product,
      visual_a: 5, // step size
      visual_b: o, // number of hops
    };
  }

  // Times two: doubling
  if (a === 2 || b === 2) {
    const o = other(2);
    return {
      strategy: "doubling",
      label: "doubling",
      visual_type: "doubling_chain",
      step_1: `doubling means adding the number to itself: ${o} + ${o}`,
      step_2: `that's ${product}`,
      value: product,
      visual_a: 2,
      visual_b: o,
      chainSteps: [o, product],
    };
  }

  // Times four: double-double
  if (a === 4 || b === 4) {
    const o = other(4);
    const once = o * 2;
    return {
      strategy: "double_double",
      label: "double-double",
      visual_type: "doubling_chain",
      step_1: `double ${o} to get ${once}`,
      step_2: `then double ${once} to get ${product}`,
      value: product,
      visual_a: 4,
      visual_b: o,
      chainSteps: [o, once, product],
    };
  }

  // Times eight: repeated doubling
  if (a === 8 || b === 8) {
    const o = other(8);
    const once = o * 2;
    const twice = once * 2;
    return {
      strategy: "repeated_doubling",
      label: "double three times",
      visual_type: "doubling_chain",
      step_1: `double ${o} to ${once}, then to ${twice}`,
      step_2: `double once more: ${twice} + ${twice} = ${product}`,
      value: product,
      visual_a: 8,
      visual_b: o,
      chainSteps: [o, once, twice, product],
    };
  }

  // Square facts
  if (a === b) {
    return {
      strategy: "square_fact",
      label: "square fact",
      visual_type: "array",
      step_1: `picture a ${a}-by-${a} square`,
      step_2: `${a} × ${a} = ${product}`,
      value: product,
      visual_a: a,
      visual_b: a,
    };
  }

  // Times nine: near ten
  if (a === 9 || b === 9) {
    const o = other(9);
    const tenPart = o * 10;
    return {
      strategy: "near_ten",
      label: "near ten",
      visual_type: "groups",
      step_1: `start with ${o} × 10 = ${tenPart}`,
      step_2: `take away one group of ${o}: ${tenPart} − ${o} = ${product}`,
      value: product,
      visual_a: 10, // show 10 groups
      visual_b: o,
      removeGroups: 1, // last 1 group struck-through
    };
  }

  // Fallback: build from five
  const anchor = Math.min(a, b);
  const mult = Math.max(a, b);
  const fivePart = anchor * 5;
  const extra = mult - 5;
  const extraPart = anchor * extra;

  return {
    strategy: "build_from_five",
    label: "build from five",
    visual_type: "groups",
    step_1: `you know ${anchor} × 5 = ${fivePart}`,
    step_2: `add ${extra} more group${extra === 1 ? "" : "s"} of ${anchor} (${extraPart}) to get ${product}`,
    value: product,
    visual_a: mult,
    visual_b: anchor,
    extraGroups: extra, // last 'extra' groups highlighted
  };
}

// Addition (fact tiers A1–A2)
export function pickAdditionStrategy(a: number, b: number): StrategyPlan {
  const result = a + b;
  const larger = Math.max(a, b);
  const smaller = Math.min(a, b);

  if (a === b) {
    return {
      strategy: "doubles",
      label: "doubles",
      visual_type: "parts",
      step_1: `this is a doubles fact: ${a} + ${a}`,
      step_2: `= ${result}`,
      value: result,
      partA: a,
      partB: b,
    };
  }

  if (result > 10) {
    const bridge = 10 - larger;
    const leftover = smaller - bridge;
    return {
      strategy: "make_ten",
      label: "make ten",
      visual_type: "parts",
      step_1: `take ${bridge} from ${smaller} to make ${larger} into 10`,
      step_2: `then add the leftover ${leftover}: 10 + ${leftover} = ${result}`,
      value: result,
      partA: larger,
      partB: smaller,
    };
  }

  return {
    strategy: "count_on",
    label: "count on",
    visual_type: "parts",
    step_1: `start at ${larger} and count on ${smaller}`,
    step_2: `= ${result}`,
    value: result,
    partA: larger,
    partB: smaller,
  };
}

// Subtraction (fact tiers S1–S2)
export function pickSubtractionStrategy(a: number, b: number): StrategyPlan {
  const result = a - b;
  const label = b <= 3 ? "count back" : "take away";
  const strategy = b <= 3 ? "count_back" : "take_away";

  return {
    strategy,
    label,
    visual_type: "remove",
    step_1: `start at ${a}, ${b <= 3 ? "count back" : "take away"} ${b}`,
    step_2: `= ${result}`,
    value: result,
    total: a,
    removeCount: b,
  };
}

// Division (fact tiers D1–D4)
export function pickDivisionStrategy(dividend: number, divisor: number): StrategyPlan {
  const quotient = Math.round(dividend / divisor);

  if (divisor === 1) {
    return {
      strategy: "identity",
      label: "divide by one",
      visual_type: "none",
      step_1: `anything ÷ 1 stays the same`,
      step_2: `${dividend} ÷ 1 = ${quotient}`,
      value: quotient,
    };
  }

  if (divisor === 2) {
    return {
      strategy: "halving",
      label: "halving",
      visual_type: "groups",
      step_1: `split ${dividend} into 2 equal parts`,
      step_2: `each part is ${quotient}`,
      value: quotient,
      visual_a: 2,
      visual_b: quotient,
    };
  }

  if (divisor === 10) {
    return {
      strategy: "remove_zero",
      label: "remove the zero",
      visual_type: "none",
      step_1: `dividing by 10 — take the zero off ${dividend}`,
      step_2: `= ${quotient}`,
      value: quotient,
    };
  }

  if (divisor === 5) {
    return {
      strategy: "skip_count_back",
      label: "skip-count by 5",
      visual_type: "number_line",
      step_1: `count by 5s up to ${dividend}`,
      step_2: `that's ${quotient} fives, so the answer is ${quotient}`,
      value: quotient,
      visual_a: 5,
      visual_b: quotient,
    };
  }

  if (divisor === 4) {
    return {
      strategy: "halve_twice",
      label: "halve twice",
      visual_type: "chain",
      step_1: `halve ${dividend} to ${dividend / 2}`,
      step_2: `halve again to get ${quotient}`,
      value: quotient,
      chainSteps: [dividend, dividend / 2, quotient],
    };
  }

  if (divisor === 8) {
    return {
      strategy: "halve_three_times",
      label: "halve three times",
      visual_type: "chain",
      step_1: `halve ${dividend} → ${dividend / 2} → ${dividend / 4}`,
      step_2: `halve once more to get ${quotient}`,
      value: quotient,
      chainSteps: [dividend, dividend / 2, dividend / 4, quotient],
    };
  }

  return {
    strategy: "times_table_link",
    label: "times-table link",
    visual_type: "groups",
    step_1: `${divisor} × ${quotient} = ${dividend}`,
    step_2: `so ${dividend} ÷ ${divisor} = ${quotient}`,
    value: quotient,
    visual_a: quotient,
    visual_b: divisor,
  };
}
