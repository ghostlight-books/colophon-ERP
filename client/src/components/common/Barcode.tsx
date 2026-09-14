import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  height?: number;
}

// Renders a real scannable barcode -- EAN-13 for a proper 13-digit ISBN
// (the actual "Bookland" symbology printed on real book covers), falling
// back to CODE128 for anything else (10-digit ISBNs, SKUs, or an EAN-13
// with a bad check digit that jsbarcode's EAN13 encoder would reject).
export default function Barcode({ value, height = 26 }: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    const digitsOnly = value.replace(/[^0-9]/g, "");
    const options = { width: 1.4, height, displayValue: true, fontSize: 9, margin: 0 };

    try {
      if (digitsOnly.length === 13) {
        JsBarcode(ref.current, digitsOnly, { ...options, format: "EAN13" });
        return;
      }
      throw new Error("not EAN-13 length");
    } catch {
      try {
        JsBarcode(ref.current, value, { ...options, format: "CODE128" });
      } catch {
        // Leave the SVG empty if even CODE128 can't encode this value (e.g. empty string).
      }
    }
  }, [value, height]);

  return <svg ref={ref} />;
}
