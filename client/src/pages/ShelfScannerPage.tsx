import ShelfScannerView from "../components/ShelfScanner/ShelfScannerView";
import type { ValuedBook } from "../types/shelfScanner";

export default function ShelfScannerPage(): JSX.Element {
  // Mock integration point: wire this to receiveInventory (or scanLibraryIsbn
  // for the Library edition) once ValuedBook -> BookLookup mapping is decided.
  const handleAddToInventory = (book: ValuedBook): void => {
    console.info("[Shelf Scanner] Add to inventory requested:", book);
  };

  return <ShelfScannerView onAddToInventory={handleAddToInventory} />;
}
