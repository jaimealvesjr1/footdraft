import { db } from "./firebase";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import type { DraftState } from "../types";

export async function createDraft(draft: DraftState) {
  await setDoc(doc(db, "drafts", draft.id), draft);
}

export async function updateDraft(id: string, data: Partial<DraftState>) {
  await updateDoc(doc(db, "drafts", id), data);
}
