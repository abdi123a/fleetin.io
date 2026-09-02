import { PROOF_OF_DELIVERY, PROOF_OF_RETURN } from './api/documentsService';

/**
 * Which rungs of the booking ladder cannot be claimed on somebody's word.
 *
 * Two, at the two ends of the job. The backend refuses both without their
 * paper (`hasProofOfDelivery` / `hasProofOfReturn`), and this is the frontend's
 * copy of the same rule — not to duplicate the guard, but so the operator is
 * asked for the file in the dialog that records the moment rather than being
 * refused after the fact by an error message about a document.
 *
 * Kept beside the categories themselves so the two cannot drift: a rung added
 * here that the backend does not gate would ask for paperwork nothing wants,
 * and the reverse would produce a refusal with no way to satisfy it.
 */
export interface ProofRequirement {
  /** The document category the files are filed under. */
  category: typeof PROOF_OF_DELIVERY | typeof PROOF_OF_RETURN;
  /** What the dialog calls it. */
  title: string;
  /** The line under the title — what the operator should be holding. */
  hint: string;
  /** Said when they try to record the moment with nothing attached. */
  missing: string;
}

export const PROOF_OF_DELIVERY_REQUIREMENT: ProofRequirement = {
  category: PROOF_OF_DELIVERY,
  title: 'Proof of delivery',
  hint: 'The signed delivery note, and any photographs from the drop.',
  missing: 'Attach the proof of delivery — a delivery cannot be recorded without it.',
};

export const PROOF_OF_RETURN_REQUIREMENT: ProofRequirement = {
  category: PROOF_OF_RETURN,
  title: 'Proof of return',
  hint: 'The depot receipt for the empty container.',
  missing: 'Attach the depot receipt — an empty return cannot be recorded without it.',
};

/**
 * The proof a rung owes, or `null` for the rungs that owe none.
 *
 * `Arrived` is the delivery, whatever the load is carrying — a bulk tip needs
 * its note as much as a container drop does. `Completed` is the box coming
 * home, which only a load with a container has: a tipped bulk load is finished
 * at delivery and has nothing left to prove.
 */
export function proofRequiredFor(rung: string, hasContainer: boolean): ProofRequirement | null {
  if (rung === 'Arrived') return PROOF_OF_DELIVERY_REQUIREMENT;
  if (rung === 'Completed' && hasContainer) return PROOF_OF_RETURN_REQUIREMENT;
  return null;
}

/**
 * Every proof owed by a walk that ends at `target`.
 *
 * The picker walks the ladder — choosing "Empty Returned" from "Picked Up"
 * writes six rungs — so a single click can pass through both gated rungs at
 * once, and asking for one document would leave the walk refused at the other
 * with half its rungs already written. The dialog asks for everything the walk
 * will be asked for, up front.
 */
export function proofsRequiredForWalk(path: readonly string[], hasContainer: boolean): ProofRequirement[] {
  const proofs: ProofRequirement[] = [];
  for (const rung of path) {
    const proof = proofRequiredFor(rung, hasContainer);
    if (proof) proofs.push(proof);
  }
  return proofs;
}
