// Store minimale (singleton di modulo) per passare un mazzo salvato al
// Simulatore come slot A o B. Sopravvive al cambio di route nella SPA, così
// si può inviare deck1 come A, poi deck2 come B da due navigazioni distinte.

export interface CompareSlot {
  name: string;
  text: string; // decklist in formato Arena/MTGO
}

const slots: { A?: CompareSlot; B?: CompareSlot } = {};

export function setCompareSlot(slot: "A" | "B", data: CompareSlot): void {
  slots[slot] = data;
}

export function getCompareSlots(): { A?: CompareSlot; B?: CompareSlot } {
  return slots;
}
