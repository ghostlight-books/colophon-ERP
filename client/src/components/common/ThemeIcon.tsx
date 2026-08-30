import React from "react";

export type ThemeIconName =
  | "growth"
  | "book"
  | "online-store"
  | "fantasy"
  | "peace"
  | "newspaper"
  | "chat"
  | "info"
  | "keep-in-list"
  | "drone"
  | "global"
  | "cloud"
  | "cart"
  | "gamepad"
  | "cookbook"
  | "audiobook"
  | "engineer"
  | "open-book"
  | "pet"
  | "magazine"
  | "dictionary"
  | "graduation"
  | "bible"
  | "customer"
  | "bookstore"
  | "horoscope"
  | "geography"
  | "gift"
  | "fiction"
  | "fashion"
  | "law"
  | "horror"
  | "bookworm"
  | "ebook"
  | "children"
  | "art"
  | "cut"
  | "archaeology"
  | "language"
  | "books"
  | "economy"
  | "rating"
  | "cellphone"
  | "photography"
  | "literature"
  | "database"
  | "bookmark"
  | "braille"
  | "forbidden"
  | "cashier"
  | "barcode-scanner"
  | "scanner"
  | "scan";

const ICON_MAP: Record<ThemeIconName, string> = {
  growth: "001-growth.svg",
  book: "002-book.svg",
  "online-store": "003-online store.svg",
  fantasy: "004-fantasy.svg",
  peace: "005-peace.svg",
  newspaper: "006-newspaper.svg",
  chat: "007-chat bubble.svg",
  info: "008-information.svg",
  "keep-in-list": "009-keep in list.svg",
  drone: "010-drone.svg",
  global: "011-global.svg",
  cloud: "012-cloud.svg",
  cart: "013-shopping cart.svg",
  gamepad: "014-gamepad.svg",
  cookbook: "015-cookbook.svg",
  audiobook: "016-audio book.svg",
  engineer: "017-engineer.svg",
  "open-book": "018-book.svg",
  pet: "019-pet.svg",
  magazine: "020-magazine.svg",
  dictionary: "021-dictionary.svg",
  graduation: "022-graduation.svg",
  bible: "023-bible.svg",
  customer: "024-customer.svg",
  bookstore: "025-bookstore.svg",
  horoscope: "026-horoscope.svg",
  geography: "027-geography.svg",
  gift: "028-gift.svg",
  fiction: "029-fiction.svg",
  fashion: "030-fashion.svg",
  law: "031-law.svg",
  horror: "032-horror.svg",
  bookworm: "033-bookworm.svg",
  ebook: "034-ebook.svg",
  children: "035-children.svg",
  art: "036-art.svg",
  cut: "037-cut.svg",
  archaeology: "038-archaeology.svg",
  language: "039-language.svg",
  books: "040-books.svg",
  economy: "041-economy.svg",
  rating: "042-rating.svg",
  cellphone: "043-cellphone.svg",
  photography: "044-photography.svg",
  literature: "045-literature.svg",
  database: "046-database.svg",
  bookmark: "047-bookmark.svg",
  braille: "048-braille.svg",
  forbidden: "049-forbidden.svg",
  cashier: "050-cashier.svg",
  "barcode-scanner": "barcode-scanner.svg",
  scanner: "barcode-scanner.svg",
  scan: "barcode-scanner.svg",
};

interface ThemeIconProps {
  name: ThemeIconName;
  className?: string;
  size?: number;
  alt?: string;
}

export default function ThemeIcon({
  name,
  className = "w-5 h-5 inline-block object-contain",
  size,
  alt = "",
}: ThemeIconProps) {
  const fileName = ICON_MAP[name] || "040-books.svg";
  const src = `/icons/theme/${encodeURIComponent(fileName)}`;

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      aria-hidden="true"
    />
  );
}
