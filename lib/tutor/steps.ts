import { Operation } from "./generateQuestion";

export function computeExampleSteps(
  operation: Operation,
  a: number,
  b: number,
  remainder?: number
): string[] {
  if (operation === "addition") {
    return computeAdditionSteps(a, b);
  } else if (operation === "subtraction") {
    return computeSubtractionSteps(a, b);
  } else if (operation === "multiplication") {
    return computeMultiplicationSteps(a, b);
  } else if (operation === "division") {
    return computeDivisionSteps(a, b, remainder);
  }
  return [];
}

function computeAdditionSteps(a: number, b: number): string[] {
  const aStr = String(a);
  const bStr = String(b).padStart(aStr.length, "0");
  const steps: string[] = [];
  let carry = 0;

  // Check if there are any carries at all
  let hasCarry = false;
  for (let i = aStr.length - 1; i >= 0; i--) {
    const sum = Number(aStr[i]) + Number(bStr[i]) + carry;
    if (sum >= 10) {
      hasCarry = true;
      break;
    }
  }

  // If no carries, just one line
  if (!hasCarry) {
    return [];
  }

  // Walk through each position with carries
  carry = 0;
  for (let i = aStr.length - 1; i >= 0; i--) {
    const aDigit = Number(aStr[i]);
    const bDigit = Number(bStr[i]);
    const sum = aDigit + bDigit + carry;
    const result = sum % 10;
    carry = Math.floor(sum / 10);

    if (sum >= 10) {
      steps.push(
        `Column ${aStr.length - i}: ${aDigit} + ${bDigit} = ${sum}, write ${result} and carry ${carry}.`
      );
    }
  }

  if (carry > 0) {
    steps.push(`Final carry: write ${carry} at the front.`);
  }

  return steps;
}

function computeSubtractionSteps(a: number, b: number): string[] {
  const aStr = String(a);
  const bStr = String(b).padStart(aStr.length, "0");
  const steps: string[] = [];
  let borrow = 0;

  // Check if there are any borrows
  let hasBorrow = false;
  for (let i = aStr.length - 1; i >= 0; i--) {
    const aDig = Number(aStr[i]);
    const bDig = Number(bStr[i]) + borrow;
    if (aDig < bDig) {
      hasBorrow = true;
      break;
    }
  }

  // If no borrows, just one line
  if (!hasBorrow) {
    return [];
  }

  // Walk through each position with borrows
  borrow = 0;
  for (let i = aStr.length - 1; i >= 0; i--) {
    const aDig = Number(aStr[i]);
    const bDig = Number(bStr[i]);
    const effective_a = aDig - borrow;

    if (effective_a < bDig) {
      steps.push(
        `Column ${aStr.length - i}: Can't take ${bDig} from ${aDig}, borrow 10. ${effective_a + 10} − ${bDig} = ${effective_a + 10 - bDig}.`
      );
      borrow = 1;
    } else {
      if (borrow > 0) {
        steps.push(
          `Column ${aStr.length - i}: ${aDig} − ${bDig} − (borrow) = ${effective_a - bDig}.`
        );
      }
      borrow = 0;
    }
  }

  return steps;
}

function computeMultiplicationSteps(a: number, b: number): string[] {
  // Single-digit multiplication: one line
  if (a < 10 && b < 10) {
    return [];
  }

  const steps: string[] = [];
  const smaller = Math.min(a, b);
  const larger = Math.max(a, b);

  // 2-digit × 1-digit or 2-digit × 2-digit
  const bStr = String(smaller).split("").map(Number);

  let offset = 0;
  for (let i = bStr.length - 1; i >= 0; i--) {
    const digit = bStr[i];
    const partial = larger * digit;
    const shiftedPower = bStr.length - 1 - i;

    if (digit === 0) {
      steps.push(
        `${larger} × ${digit} = 0 (shift by ${shiftedPower} position${shiftedPower !== 1 ? "s" : ""}).`
      );
    } else {
      steps.push(
        `${larger} × ${digit} = ${partial} (shift by ${shiftedPower} position${shiftedPower !== 1 ? "s" : ""}).`
      );
    }
    offset++;
  }

  return steps;
}

function computeDivisionSteps(
  dividend: number,
  divisor: number,
  remainder?: number
): string[] {
  // Single-digit division: one line
  if (dividend < 10 && divisor < 10) {
    return [];
  }

  const steps: string[] = [];
  const dividendStr = String(dividend);
  let current = 0;
  let quotient = "";
  let stepNum = 1;

  for (let i = 0; i < dividendStr.length; i++) {
    const digit = Number(dividendStr[i]);
    current = current * 10 + digit;

    const q = Math.floor(current / divisor);
    const product = q * divisor;
    const rem = current - product;

    if (quotient.length > 0 || q > 0) {
      // We're writing a non-zero quotient digit or we've already started
      steps.push(
        `Step ${stepNum}: Look at ${current}. ${divisor} goes in ${q} time(s). ${q} × ${divisor} = ${product}. ${current} − ${product} = ${rem}.`
      );
      quotient += String(q);
      stepNum++;
    } else if (i < dividendStr.length - 1) {
      // Leading zero, just continue
      steps.push(`Step ${stepNum}: Look at ${current}. ${divisor} doesn't go in, continue.`);
      stepNum++;
    }

    if (i < dividendStr.length - 1) {
      const nextDigit = dividendStr[i + 1];
      steps.push(`Bring down ${nextDigit} to make ${rem * 10 + Number(nextDigit)}.`);
    } else {
      // Last digit
      if (rem > 0) {
        steps.push(`Final remainder: ${rem}.`);
      }
    }

    current = rem;
  }

  return steps;
}
