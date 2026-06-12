import { useEffect, useState } from "react";
import { db } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export default function Draft() {
  const [draft, setDraft] = useState<any>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "drafts", "draft1"), (doc) => {
      setDraft(doc.data());
    });

    return () => unsub();
  }, []);

  if (!draft) return <div>Carregando...</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">FootDraft</h1>

      <p>Turno atual: {draft.currentTurn}</p>
    </div>
  );
}
